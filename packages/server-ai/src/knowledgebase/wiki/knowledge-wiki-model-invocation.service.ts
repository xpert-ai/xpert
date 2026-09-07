import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { toJsonSchema } from '@langchain/core/utils/json_schema'
import {
    AiModelTypeEnum,
    isOutputTokenParameter,
    KnowledgeWikiPageContributionPayload,
    normalizeKnowledgebaseWikiConfig
} from '@xpert-ai/contracts'
import { countTokensSafe } from '@xpert-ai/plugin-sdk'
import type { TLLMUsage } from '@xpert-ai/plugin-sdk'
import { getErrorMessage } from '@xpert-ai/server-common'
import { Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { t } from 'i18next'
import { Repository } from 'typeorm'
import { CopilotTokenRecordCommand } from '../../copilot-user'
import { KnowledgeDocument } from '../../knowledge-document/document.entity'
import { AgentMiddlewareRuntimeService } from '../../shared/agent/middleware-runtime'
import { Knowledgebase } from '../knowledgebase.entity'
import { KnowledgeWikiJob, KnowledgeWikiModelInvocation, KnowledgeWikiPage } from './entities'
import { isUsableKnowledgeWikiModel, resolveKnowledgeWikiModel } from './knowledge-wiki-config'
import {
    buildKnowledgeWikiMapMessages,
    buildKnowledgeWikiReduceMessages,
    knowledgeWikiMapOutputSchema,
    knowledgeWikiReduceOutputSchema,
    parseKnowledgeWikiMapOutput,
    parseKnowledgeWikiReduceOutput,
    resolveKnowledgeWikiMapSources
} from './knowledge-wiki-model'
import { KnowledgeWikiMapModelOutput, KnowledgeWikiModelOutput, KnowledgeWikiReduceModelOutput } from './types'
import { hashKnowledgeWikiValue } from './knowledge-wiki-generation.utils'
import { KnowledgeWikiInvocationBudgetService } from './knowledge-wiki-invocation-budget.service'

const MAX_ERROR_LENGTH = 4000

type UsageTotals = {
    inputTokens: number
    outputTokens: number
    totalTokens: number
}

export type KnowledgeWikiReduceSource = {
    document: KnowledgeDocument
    payload: KnowledgeWikiPageContributionPayload
    lifecycleGeneration: number
    evidence: Array<{
        sourceChunkId: string
        quote: string
        ordinal: number
        sectionAnchor: string
    }>
}

function mergeUsage(current: UsageTotals, usage: TLLMUsage) {
    if (usage.type === 'estimated') return current
    return {
        inputTokens: Math.max(current.inputTokens, usage.promptTokens ?? 0),
        outputTokens: Math.max(current.outputTokens, usage.completionTokens ?? 0),
        totalTokens: Math.max(current.totalTokens, usage.totalTokens ?? 0)
    }
}

@Injectable()
export class KnowledgeWikiModelInvocationService {
    constructor(
        @InjectRepository(KnowledgeWikiModelInvocation)
        private readonly invocationRepository: Repository<KnowledgeWikiModelInvocation>,
        private readonly modelRuntime: AgentMiddlewareRuntimeService,
        private readonly commandBus: CommandBus,
        private readonly budget: KnowledgeWikiInvocationBudgetService
    ) {}

    async invokeMapModel(
        job: KnowledgeWikiJob,
        knowledgebase: Knowledgebase,
        documentName: string,
        chunks: Array<{ id: string; content: string }>,
        ordinal: number
    ) {
        const output = await this.invokeModel<KnowledgeWikiMapModelOutput>({
            job,
            knowledgebase,
            stage: 'map',
            ordinal,
            inputFingerprint: hashKnowledgeWikiValue({ documentName, chunks, config: knowledgebase.wikiConfig }),
            messages: buildKnowledgeWikiMapMessages({
                documentName,
                chunks,
                config: normalizeKnowledgebaseWikiConfig(knowledgebase.wikiConfig)
            }),
            schema: knowledgeWikiMapOutputSchema,
            parse: parseKnowledgeWikiMapOutput
        })
        // Validate after persisting the known response; citation errors must not imply an uncertain provider charge.
        return resolveKnowledgeWikiMapSources(output, chunks)
    }

    async invokeReduceModel(
        job: KnowledgeWikiJob,
        knowledgebase: Knowledgebase,
        page: KnowledgeWikiPage,
        sources: KnowledgeWikiReduceSource[],
        inputFingerprint: string
    ) {
        return this.invokeModel<KnowledgeWikiReduceModelOutput>({
            job,
            knowledgebase,
            stage: 'reduce',
            ordinal: 0,
            inputFingerprint,
            messages: buildKnowledgeWikiReduceMessages({
                pageKey: page.pageKey,
                canonicalName: page.canonicalName,
                sources: sources.map((source) => ({
                    sourceDocumentId: source.document.id,
                    contribution: source.payload,
                    evidence: source.evidence.map(({ sourceChunkId, quote }) => ({ sourceChunkId, quote }))
                })),
                config: normalizeKnowledgebaseWikiConfig(knowledgebase.wikiConfig)
            }),
            schema: knowledgeWikiReduceOutputSchema,
            parse: parseKnowledgeWikiReduceOutput
        })
    }

    private async invokeModel<T extends KnowledgeWikiModelOutput>(input: {
        job: KnowledgeWikiJob
        knowledgebase: Knowledgebase
        stage: 'map' | 'reduce'
        ordinal: number
        inputFingerprint: string
        messages: Array<{ role: 'system' | 'user'; content: string }>
        schema: typeof knowledgeWikiMapOutputSchema | typeof knowledgeWikiReduceOutputSchema
        parse: (value: unknown) => T
    }): Promise<T> {
        const model = resolveKnowledgeWikiModel(input.knowledgebase)
        if (!isUsableKnowledgeWikiModel(model)) {
            throw new Error(
                t('server-ai:Error.KnowledgebaseWikiModelRequired', {
                    defaultValue: 'A usable Wiki model or general LLM is required'
                })
            )
        }
        const requestId = `knowledge-wiki:${input.job.id}:${input.job.generationAttempt}:${input.stage}:${input.ordinal}:${input.inputFingerprint}`
        const outputTokens = Math.max(
            4096,
            ...Object.entries(model.options ?? {})
                .filter(([name]) => isOutputTokenParameter({ name }))
                .map(([, value]) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0))
        )
        // Reserve prompt, schema allowance and output estimate; actual usage is recorded separately.
        const estimatedTokens = countTokensSafe(JSON.stringify(input.messages)) + 1024 + Math.ceil(outputTokens)
        const invocation = await this.budget.reserve(
            input.job,
            this.invocationRepository.create({
                tenantId: input.knowledgebase.tenantId,
                organizationId: input.knowledgebase.organizationId,
                knowledgebaseId: input.knowledgebase.id,
                jobId: input.job.id,
                requestId,
                stage: input.stage,
                callOrdinal: input.ordinal,
                generationAttempt: input.job.generationAttempt,
                inputFingerprint: input.inputFingerprint,
                status: 'prepared',
                reconciliationStatus: 'not_available',
                modelId: model.id,
                modelName: model.model,
                billingPrincipalId: input.job.billingPrincipalId,
                billingStatus: 'pending'
            }),
            estimatedTokens
        )
        if (invocation?.status === 'succeeded' && invocation.structuredOutput) {
            await this.deliverBilling(invocation, input.knowledgebase, model)
            return input.parse(invocation.structuredOutput)
        }
        if (invocation.status === 'running') {
            await this.invocationRepository.update(
                { id: invocation.id, status: 'running' },
                {
                    status: 'indeterminate',
                    reconciliationStatus: 'indeterminate',
                    errorCode: 'provider_outcome_indeterminate'
                }
            )
            throw this.indeterminateError()
        }
        const retryPreparation = invocation.status === 'failed' && invocation.reconciliationStatus === 'not_executed'
        if (invocation.status !== 'prepared' && !retryPreparation) {
            throw this.indeterminateError()
        }
        let usage: UsageTotals = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
        const running: Partial<KnowledgeWikiModelInvocation> = {
            status: 'running',
            reconciliationStatus: 'not_available',
            errorCode: null,
            error: null,
            completedAt: null,
            billingStatus: 'pending'
        }
        const claimed = await this.invocationRepository.update(
            {
                id: invocation.id,
                status: retryPreparation ? 'failed' : 'prepared',
                ...(retryPreparation ? { reconciliationStatus: 'not_executed' as const } : {})
            },
            running
        )
        if (!claimed.affected) throw this.indeterminateError()
        Object.assign(invocation, running)
        invocation.status = 'running'
        let invocationStarted = false
        try {
            // Compile before invoking: some SDKs otherwise defer Zod conversion until request construction.
            const schema = toJsonSchema(input.schema)
            const client = await this.modelRuntime.createModelClient<BaseChatModel>(
                model,
                {
                    skipTokenRecord: true,
                    usageCallback: (tokens) => {
                        usage = mergeUsage(usage, tokens)
                    }
                },
                {
                    tenantId: input.knowledgebase.tenantId,
                    organizationId: input.knowledgebase.organizationId,
                    userId: input.job.billingPrincipalId
                }
            )
            const structured = client.withStructuredOutput(schema, {
                name: input.stage === 'map' ? 'knowledge_wiki_map' : 'knowledge_wiki_reduce'
            })
            invocationStarted = true
            const rawOutput = await structured.invoke(input.messages)
            const output = input.parse(rawOutput)
            invocation.status = 'succeeded'
            invocation.structuredOutput = output
            invocation.tokenUsage = { ...usage, estimatedTokens: invocation.tokenUsage?.estimatedTokens }
            invocation.completedAt = new Date()
            await this.invocationRepository.save(invocation)
            await this.deliverBilling(invocation, input.knowledgebase, model)
            return output
        } catch (error) {
            if (invocation.status === 'running') {
                invocation.status = invocationStarted ? 'indeterminate' : 'failed'
                invocation.reconciliationStatus = invocationStarted ? 'indeterminate' : 'not_executed'
                invocation.errorCode = invocationStarted ? 'provider_outcome_indeterminate' : 'model_preparation_failed'
                if (!invocationStarted) invocation.billingStatus = 'delivered'
                invocation.error = getErrorMessage(error).slice(0, MAX_ERROR_LENGTH)
                invocation.completedAt = new Date()
                await this.invocationRepository.save(invocation)
            }
            throw error
        }
    }

    private indeterminateError() {
        return new Error(
            t('server-ai:Error.KnowledgebaseWikiInvocationIndeterminate', {
                defaultValue: 'The previous Wiki model invocation has an indeterminate provider outcome'
            })
        )
    }

    private async deliverBilling(
        invocation: KnowledgeWikiModelInvocation,
        knowledgebase: Knowledgebase,
        model: NonNullable<ReturnType<typeof resolveKnowledgeWikiModel>>
    ) {
        if (invocation.billingStatus === 'delivered') return
        const usage = invocation.tokenUsage
        if (!usage?.totalTokens) {
            invocation.billingStatus = 'delivered'
            await this.invocationRepository.save(invocation)
            return
        }
        try {
            await this.commandBus.execute(
                new CopilotTokenRecordCommand({
                    tenantId: knowledgebase.tenantId,
                    requestId: invocation.requestId,
                    organizationId: knowledgebase.organizationId,
                    userId: invocation.billingPrincipalId,
                    copilotId: model.copilotId,
                    model: model.model,
                    modelType: model.modelType ?? AiModelTypeEnum.LLM,
                    promptTokens: usage.inputTokens,
                    completionTokens: usage.outputTokens,
                    tokenUsed: usage.totalTokens
                })
            )
            invocation.billingStatus = 'delivered'
            invocation.error = null
            await this.invocationRepository.save(invocation)
        } catch (error) {
            invocation.billingStatus = 'failed'
            invocation.errorCode = 'billing_delivery_failed'
            invocation.error = getErrorMessage(error).slice(0, MAX_ERROR_LENGTH)
            await this.invocationRepository.save(invocation)
            throw error
        }
    }
}
