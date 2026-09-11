// Questions are optional projections. Publish only the generation still owned by the current chunk version.
// Do not retry failed model calls automatically: indexing retries reuse persisted questions instead.
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import {
    IKnowledgeDocument,
    KBDocumentStatusEnum,
    KnowledgeChunkQuestions,
    KnowledgeQuestionGenerationConfig
} from '@xpert-ai/contracts'
import { getErrorMessage } from '@xpert-ai/server-common'
import { RequestContext } from '@xpert-ai/server-core'
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { randomUUID } from 'node:crypto'
import { t } from 'i18next'
import { AgentMiddlewareRuntimeService } from '../../shared/agent/middleware-runtime'
import { extractTextFromMessageContent } from '../../shared/agent/stream-text'
import { KnowledgebaseService } from '../../knowledgebase/knowledgebase.service'
import { KnowledgeDocumentChunk } from '../chunk/chunk.entity'
import { KnowledgeDocumentService } from '../document.service'
import { resolveKnowledgeDocumentParserConfig } from '../parser-config'
import { writeQuestionState } from './question-state'
import { buildQuestionVectors } from './question-vectors'
import {
    isQuestionChunk,
    parseGeneratedQuestions,
    questionInputHash,
    questionMessages,
    questionSourceContent,
    questionSourceHash,
    validateQuestionGeneration
} from './question-generation'

@Injectable()
export class KnowledgeQuestionGenerationService {
    private readonly logger = new Logger(KnowledgeQuestionGenerationService.name)

    constructor(
        @InjectRepository(KnowledgeDocumentChunk) private readonly chunks: Repository<KnowledgeDocumentChunk>,
        private readonly documents: KnowledgeDocumentService,
        private readonly knowledgebases: KnowledgebaseService,
        private readonly models: AgentMiddlewareRuntimeService
    ) {}

    async read(documentId: string, chunkId: string) {
        await this.documents.assertDocumentReadAccess(documentId)
        const document = await this.documents.findOne(documentId, { relations: ['knowledgebase'] })
        const chunk = await this.chunks.findOneBy({ id: chunkId, documentId, tenantId: document.tenantId })
        if (!chunk) throw new NotFoundException()
        const config = resolveKnowledgeDocumentParserConfig(
            document,
            document.knowledgebase.parserConfig
        ).questionGeneration
        const state = chunk.metadata?.questionGeneration
        return {
            enabled: config?.enabled === true,
            state:
                state &&
                (state.sourceHash !== questionSourceHash(chunk) ||
                    (state.status === 'generating' && Date.now() - Date.parse(state.updatedAt) >= 15 * 60 * 1000))
                    ? { ...state, status: 'failed' as const, error: t('server-ai:Error.KnowledgeQuestionsStale') }
                    : state
        }
    }

    async assertCanRegenerate(documentId: string, chunkId: string) {
        await this.documents.assertDocumentWriteAccess(documentId)
        const document = await this.documents.findOne(documentId, { relations: ['knowledgebase'] })
        const config = resolveKnowledgeDocumentParserConfig(
            document,
            document.knowledgebase.parserConfig
        ).questionGeneration
        validateQuestionGeneration(config)
        await this.knowledgebases.assertNotRebuilding(document.knowledgebaseId)
        const chunks = await this.chunks.find({ where: { documentId, tenantId: document.tenantId } })
        const chunk = chunks.find((item) => item.id === chunkId)
        if (!chunk) throw new NotFoundException()
        if (
            !config?.enabled ||
            document.disabled ||
            document.status !== KBDocumentStatusEnum.FINISH ||
            !isQuestionChunk(chunk, chunks)
        ) {
            throw new BadRequestException(t('server-ai:Error.KnowledgeQuestionsUnavailable'))
        }
        if (
            chunk.metadata?.questionGeneration?.status === 'generating' &&
            Date.now() - Date.parse(chunk.metadata.questionGeneration.updatedAt) < 15 * 60 * 1000
        ) {
            throw new BadRequestException(t('server-ai:Error.KnowledgeQuestionsBusy'))
        }
    }

    async process(documentId: string, chunkId?: string, force = false) {
        await this.documents.assertDocumentWriteAccess(documentId)
        const document = await this.documents.findOne(documentId, { relations: ['knowledgebase'] })
        if (document.status !== KBDocumentStatusEnum.FINISH || document.disabled) return
        const config = resolveKnowledgeDocumentParserConfig(
            document,
            document.knowledgebase.parserConfig
        ).questionGeneration
        validateQuestionGeneration(config)
        const chunks = await this.chunks.find({
            where: { documentId, tenantId: document.tenantId },
            order: { createdAt: 'ASC' }
        })
        if (chunkId && !chunks.some((chunk) => chunk.id === chunkId)) throw new NotFoundException()
        const selected = chunkId ? chunks.filter((chunk) => chunk.id === chunkId) : chunks
        for (const chunk of selected) {
            if (!config?.enabled || !isQuestionChunk(chunk, chunks)) {
                await this.clear(document, chunk)
                continue
            }
            const parent = chunks.find((item) => item.metadata?.chunkId === chunk.metadata?.parentId)
            // Context clarifies the source; it never supplies the answer to a generated question.
            const context = parent ? questionSourceContent(parent).slice(0, 12000) : ''
            await this.generate(document, chunk, config, context, force)
        }
    }

    async remove(documentId: string, chunkId: string, questionId: string) {
        await this.documents.assertDocumentWriteAccess(documentId)
        const { document, vectorStore } = await this.documents.getDocumentVectorStore(documentId)
        const chunk = await this.chunks.findOneBy({ id: chunkId, documentId, tenantId: document.tenantId })
        if (!chunk) throw new NotFoundException()
        const state = chunk.metadata?.questionGeneration
        if (!state || state.status === 'generating')
            throw new BadRequestException(t('server-ai:Error.KnowledgeQuestionsBusy'))
        const questions = state.questions.filter((item) => item.id !== questionId)
        const retainedIds = new Set(questions.flatMap((item) => item.vectorIds ?? []))
        const deletedIds = state.vectorIds.filter((id) => !retainedIds.has(id))
        // Retain a cleanup receipt if the vector backend fails after the question is removed.
        const next = { ...state, questions, updatedAt: new Date().toISOString() }
        if (!(await this.saveState(chunk, next)))
            throw new BadRequestException(t('server-ai:Error.KnowledgeQuestionsStale'))
        await vectorStore.deleteChunks(deletedIds)
        const cleaned = { ...next, vectorIds: [...retainedIds] }
        await this.saveState(chunk, cleaned)
        return cleaned
    }

    private async generate(
        document: IKnowledgeDocument,
        chunk: KnowledgeDocumentChunk,
        config: KnowledgeQuestionGenerationConfig,
        context: string,
        force: boolean
    ) {
        const inputHash = questionInputHash(chunk, context, config)
        const previous = chunk.metadata?.questionGeneration
        // A prompt upgrade must not repeat earlier paid work during automatic jobs or indexing retries.
        const sameInput =
            previous &&
            (previous.inputHash === inputHash || previous.inputHash === questionInputHash(chunk, context, config, 1))
        if (
            previous?.status === 'generating' &&
            sameInput &&
            Date.now() - Date.parse(previous.updatedAt) < 15 * 60 * 1000
        )
            return
        if (!force && sameInput && (previous.status === 'ready' || previous.status === 'failed')) return
        const reuse =
            force &&
            sameInput &&
            (previous.status === 'failed' || previous.status === 'generating') &&
            (previous.questions.length > 0 || previous.emptyReason === 'insufficient_content')
        let state: KnowledgeChunkQuestions = {
            status: 'generating',
            generationId: randomUUID(),
            inputHash,
            sourceHash: questionSourceHash(chunk),
            questions: reuse ? previous.questions : [],
            ...(reuse && previous.emptyReason ? { emptyReason: previous.emptyReason } : {}),
            vectorIds: previous?.vectorIds ?? [],
            updatedAt: new Date().toISOString()
        }
        if (!(await this.saveState(chunk, state))) return
        let newIds: string[] = []
        try {
            const { vectorStore } = await this.documents.getDocumentVectorStore(document.id)
            await vectorStore.deleteChunks(state.vectorIds)
            state.vectorIds = []
            if (!reuse) {
                if (!(await this.isCurrent(document, chunk, state))) {
                    throw new Error(t('server-ai:Error.KnowledgeQuestionsStale'))
                }
                const client = await this.models.createModelClient<BaseChatModel>(
                    structuredClone(config.model),
                    {},
                    {
                        tenantId: document.tenantId,
                        organizationId: document.organizationId,
                        userId: RequestContext.currentUserId()
                    }
                )
                const response = await client.invoke(
                    questionMessages(questionSourceContent(chunk), context, document.name, config),
                    {
                        signal: AbortSignal.timeout(120000),
                        runName: 'knowledge-question-generation',
                        metadata: { documentId: document.id, chunkId: chunk.id, generationId: state.generationId }
                    }
                )
                state.questions = parseGeneratedQuestions(
                    extractTextFromMessageContent(response.content),
                    config.questionCount ?? 3
                ).map((question) => ({ id: randomUUID(), question }))
                if (!state.questions.length) state.emptyReason = 'insufficient_content'
                // Persist the paid result before indexing so an embedding failure never needs another model call.
                if (!(await this.saveState(chunk, state))) return
            }
            const write = buildQuestionVectors(document, chunk, state, vectorStore.embeddingModelContextSize)
            newIds = write.ids
            state.vectorIds = newIds
            state.questions = write.questions
            if (!(await this.saveState(chunk, state))) return
            if (!(await this.isCurrent(document, chunk, state)))
                throw new Error(t('server-ai:Error.KnowledgeQuestionsStale'))
            if (write.chunks.length) await vectorStore.addKnowledgeDocument(document, write.chunks, { ids: newIds })
            if (!(await this.isCurrent(document, chunk, state))) {
                await vectorStore.deleteChunks(newIds)
                throw new Error(t('server-ai:Error.KnowledgeQuestionsStale'))
            }
            state = { ...state, status: 'ready', updatedAt: new Date().toISOString() }
            if (!(await this.saveState(chunk, state))) await vectorStore.deleteChunks(newIds)
        } catch (error) {
            state = {
                ...state,
                status: 'failed',
                vectorIds: [...new Set([...state.vectorIds, ...newIds])],
                error: getErrorMessage(error).slice(0, 1000),
                updatedAt: new Date().toISOString()
            }
            const saved = await this.saveState(chunk, state)
            if (!saved && newIds.length) {
                const store = await this.knowledgebases.getActiveVectorStore(document.knowledgebaseId, false)
                await store.deleteChunks(newIds)
            }
            this.logger.warn(`Question generation failed for chunk '${chunk.id}': ${state.error}`)
        }
    }

    private async isCurrent(
        document: IKnowledgeDocument,
        chunk: KnowledgeDocumentChunk,
        state: KnowledgeChunkQuestions
    ) {
        const current = await this.chunks.findOneBy({
            id: chunk.id,
            documentId: document.id,
            tenantId: document.tenantId
        })
        const source = await this.documents.findOneByOptions({ where: { id: document.id } }).catch(() => null)
        if (
            !source ||
            source.disabled ||
            source.status !== KBDocumentStatusEnum.FINISH ||
            !current ||
            current.version !== chunk.version ||
            current.metadata?.questionGeneration?.generationId !== state.generationId ||
            questionSourceHash(current) !== state.sourceHash
        )
            return false
        await this.knowledgebases.assertNotRebuilding(source.knowledgebaseId)
        const kb = await this.knowledgebases.findOne(source.knowledgebaseId)
        const config = resolveKnowledgeDocumentParserConfig(source, kb.parserConfig).questionGeneration
        return (
            config?.enabled && questionInputHash(current, await this.parentContext(current), config) === state.inputHash
        )
    }

    private async parentContext(chunk: KnowledgeDocumentChunk) {
        if (!chunk.parent?.id && !chunk.metadata?.parentId) return ''
        const chunks = await this.chunks.find({ where: { documentId: chunk.documentId, tenantId: chunk.tenantId } })
        const parent = chunks.find((item) => item.metadata?.chunkId === chunk.metadata.parentId)
        return parent ? questionSourceContent(parent).slice(0, 12000) : ''
    }

    private async clear(document: IKnowledgeDocument, chunk: KnowledgeDocumentChunk) {
        const state = chunk.metadata?.questionGeneration
        if (!state) return
        const store = await this.knowledgebases.getActiveVectorStore(document.knowledgebaseId)
        if (await this.saveState(chunk, { ...state, questions: [], status: 'ready' })) {
            await store.deleteChunks(state.vectorIds)
            await this.saveState(chunk, undefined)
        }
    }

    private async saveState(chunk: KnowledgeDocumentChunk, state: KnowledgeChunkQuestions | undefined) {
        return writeQuestionState(this.chunks, chunk, state)
    }
}
