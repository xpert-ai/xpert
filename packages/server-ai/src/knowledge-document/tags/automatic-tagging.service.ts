import { createHash } from 'node:crypto'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { DocumentTypeEnum, KBDocumentStatusEnum, isDocumentKnowledgebaseType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, SelectQueryBuilder } from 'typeorm'
import { CopilotModelService } from '../../copilot-model/copilot-model.service'
import { KnowledgeTagService, TaggingContext } from '../../knowledgebase/tags/knowledge-tag.service'
import { AgentMiddlewareRuntimeService } from '../../shared/agent/middleware-runtime'
import { extractTextFromMessageContent } from '../../shared/agent/stream-text'
import { KnowledgeDocumentChunk } from '../chunk/chunk.entity'
import {
    automaticTaggingMessages,
    normalizeAutomaticTagging,
    parseAutomaticTags,
    sampleDocumentText,
    samplePositions,
    selectTaggingModel
} from './automatic-tagging'

@Injectable()
export class KnowledgeAutomaticTaggingService {
    constructor(
        private readonly tags: KnowledgeTagService,
        @InjectRepository(KnowledgeDocumentChunk) private readonly chunks: Repository<KnowledgeDocumentChunk>,
        private readonly models: AgentMiddlewareRuntimeService,
        private readonly copilotModels: CopilotModelService
    ) {}

    async process(knowledgebaseId: string, documentId: string) {
        const context = await this.tags.context(knowledgebaseId, documentId)
        const { document, knowledgebase } = context
        const config = normalizeAutomaticTagging(knowledgebase.automaticTagging)
        if (
            !config.enabled ||
            !isDocumentKnowledgebaseType(knowledgebase.type) ||
            document.status !== KBDocumentStatusEnum.FINISH ||
            document.disabled ||
            document.type === DocumentTypeEnum.FOLDER ||
            document.metadata?.systemManaged
        )
            return
        const existing = await this.tags.existing(context)
        if (
            (!config.allowWithManualTags && existing.some((item) => item.source === 'manual')) ||
            existing.filter((item) => item.source === 'automatic').length >= config.maxTags
        )
            return
        const candidates = await this.tags.candidates(context)
        if (!candidates.length) return
        let model = selectTaggingModel(knowledgebase.automaticTagging ?? {}, knowledgebase.chatModel)
        if (!model) return
        if (model.referencedId) {
            const referenced = await this.copilotModels.findOne(model.referencedId)
            model = selectTaggingModel({
                model: { ...referenced, options: { ...referenced.options, ...model.options } }
            })
            if (!model) return
        }
        if (!model.copilotId || !model.model) return
        const content = await this.sample(context)
        const inputHash = createHash('sha256')
            .update(
                JSON.stringify({
                    version: 1,
                    publicationEpoch: document.publicationEpoch,
                    content,
                    config,
                    model,
                    candidates: candidates.map(({ id, name, description }) => ({ id, name, description }))
                })
            )
            .digest('hex')
        if (document.autoTaggingInputHash === inputHash) return
        const client = await this.models.createModelClient<BaseChatModel>(
            model,
            {},
            {
                tenantId: document.tenantId,
                organizationId: document.organizationId,
                userId: RequestContext.currentUserId()
            }
        )
        const result = await client.invoke(automaticTaggingMessages(candidates, content, config.maxTags), {
            signal: AbortSignal.timeout(60000),
            runName: 'knowledge-automatic-tagging',
            metadata: { documentId, knowledgebaseId }
        })
        const selected = parseAutomaticTags(
            extractTextFromMessageContent(result.content),
            candidates,
            config.confidenceThreshold,
            config.maxTags
        )
        return this.tags.appendAutomatic(context, candidates, selected, inputHash)
    }

    private async sample({ document }: TaggingContext) {
        const query = this.chunks
            .createQueryBuilder('chunk')
            .where({ documentId: document.id, tenantId: document.tenantId, knowledgebaseId: document.knowledgebaseId })
            .orderBy('chunk.createdAt', 'ASC')
            .addOrderBy('chunk.id', 'ASC')
        // OCR and image understanding are persisted as source pageContent, including visual chunks.
        const visualPredicate = `(chunk.metadata->>'mediaType' = 'image' OR chunk.metadata->'documentLayout'->>'type' = 'image')`
        const body = await this.sampleChunks(query.clone().andWhere(`NOT COALESCE(${visualPredicate}, false)`), 12)
        const visual = await this.sampleChunks(query.clone().andWhere(visualPredicate), 4)
        return sampleDocumentText({
            name: [document.metadata?.originalFileName, document.name]
                .filter((name) => typeof name === 'string')
                .join(' / '),
            summary: typeof document.metadata?.summary === 'string' ? document.metadata.summary : '',
            body,
            visual
        })
    }

    private async sampleChunks(query: SelectQueryBuilder<KnowledgeDocumentChunk>, maximum: number) {
        const total = await query.getCount()
        const texts: string[] = []
        for (const offset of samplePositions(total, maximum)) {
            const chunk = await query
                .clone()
                .select(
                    `CASE WHEN length(chunk."pageContent") <= 2400 THEN chunk."pageContent"
                ELSE left(chunk."pageContent", 800) || E'\\n...\\n' ||
                substring(chunk."pageContent" from greatest(1, (length(chunk."pageContent") - 800) / 2) for 800) ||
                E'\\n...\\n' || right(chunk."pageContent", 800) END`,
                    'pageContent'
                )
                .offset(offset)
                .limit(1)
                .getRawOne<{ pageContent: string }>()
            if (chunk?.pageContent) texts.push(chunk.pageContent)
        }
        return texts
    }
}
