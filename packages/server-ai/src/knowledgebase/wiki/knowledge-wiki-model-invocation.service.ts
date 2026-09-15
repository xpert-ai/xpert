import {
    wikiClassificationSchema,
    WikiClassificationModelInput,
    parseWikiClassification,
    wikiClassificationMessages
} from './knowledge-wiki-classification.model'
import type { KnowledgeWikiClassificationOutput, KnowledgeWikiTaxonomyOutput } from '@xpert-ai/contracts'
import {
    WikiTaxonomyModelInput,
    createWikiTaxonomyResponseSchema,
    parseWikiTaxonomyResponse,
    WikiTaxonomyResponseError,
    wikiTaxonomyMessages,
    parseWikiTaxonomy
} from './knowledge-wiki-taxonomy.model'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { RunnableConfig } from '@langchain/core/runnables'
import { toJsonSchema } from '@langchain/core/utils/json_schema'
import {
    AiModelTypeEnum,
    isOutputTokenParameter,
    KnowledgeWikiPageSourcePayload,
    normalizeKnowledgebaseWikiConfig
} from '@xpert-ai/contracts'
import { countTokensSafe } from '@xpert-ai/plugin-sdk'
import type { TLLMUsage } from '@xpert-ai/plugin-sdk'
import { getErrorMessage } from '@xpert-ai/server-common'
import { Injectable, Logger } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { t } from 'i18next'
import { In, Repository } from 'typeorm'
import { CopilotTokenRecordCommand } from '../../copilot-user'
import { KnowledgeDocument } from '../../knowledge-document/document.entity'
import { AgentMiddlewareRuntimeService } from '../../shared/agent/middleware-runtime'
import { extractTextFromMessageContent } from '../../shared/agent/stream-text'
import { Knowledgebase } from '../knowledgebase.entity'
import { KnowledgeWikiJob, KnowledgeWikiModelInvocation, KnowledgeWikiPage } from './entities'
import { isUsableKnowledgeWikiModel, resolveKnowledgeWikiModel } from './knowledge-wiki-config'
import {
    buildKnowledgeWikiMapMessages,
    buildKnowledgeWikiReduceMessages,
    createKnowledgeWikiMapOutputSchema,
    parseKnowledgeWikiMapOutput,
    parseKnowledgeWikiReduceOutput,
    parseKnowledgeWikiReduceText,
    resolveKnowledgeWikiMapSources
} from './knowledge-wiki-model'
import { KnowledgeWikiMapModelOutput, KnowledgeWikiModelOutput, KnowledgeWikiReduceModelOutput } from './types'
import { hashKnowledgeWikiValue } from './knowledge-wiki-generation.utils'
import {
    applyKnowledgeWikiRelations,
    knowledgeWikiRelationsMessages,
    knowledgeWikiRelationsSchema
} from './knowledge-wiki-content-quality'
import { KnowledgeWikiInvocationBudgetService } from './knowledge-wiki-invocation-budget.service'
import {
    buildKnowledgeWikiDedupMessages,
    createKnowledgeWikiDedupOutputSchema,
    KnowledgeWikiDedupModelInput,
    KnowledgeWikiDedupModelOutput,
    parseKnowledgeWikiDedupOutput
} from './knowledge-wiki-dedup-model'

const MAX_ERROR_LENGTH = 4000

type WikiModelResponse<T> =
    | {
          format: 'json'
          schema:
              | ReturnType<typeof createKnowledgeWikiMapOutputSchema>
              | ReturnType<typeof createKnowledgeWikiDedupOutputSchema>
              | typeof wikiClassificationSchema
              | ReturnType<typeof createWikiTaxonomyResponseSchema>
              | typeof knowledgeWikiRelationsSchema
          parseResponse?: (value: unknown) => T
          retryInvalidResponse?: () => Promise<T>
      }
    | { format: 'markdown'; parseText: (text: string) => T }

type UsageTotals = {
    inputTokens: number
    outputTokens: number
    totalTokens: number
}

export type KnowledgeWikiReduceSource = {
    document: KnowledgeDocument
    payload: KnowledgeWikiPageSourcePayload
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

function isProviderRequestRejected(error: unknown): boolean {
    if (!(error instanceof Error) || !('status' in error) || error.status !== 400) return false
    // Read structured SDK fields only. A message containing "400" cannot establish execution outcome.
    return (
        ('type' in error && error.type === 'invalid_request_error') ||
        ('code' in error &&
            (error.code === 'invalid_json_schema' ||
                error.code === 'InvalidParameter' ||
                error.code === 'InternalError.Algo.InvalidParameter'))
    )
}

@Injectable()
export class KnowledgeWikiModelInvocationService {
    private readonly logger = new Logger(KnowledgeWikiModelInvocationService.name)

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
            response: { format: 'json', schema: createKnowledgeWikiMapOutputSchema(chunks) },
            parse: parseKnowledgeWikiMapOutput
        })
        // Validate after persisting the known response; citation errors must not imply an uncertain provider charge.
        const grounded = resolveKnowledgeWikiMapSources(output, chunks)
        if (grounded.pages.length < 2 || grounded.pages.some((page) => page.suggestedLinks.length)) return grounded
        const relations = await this.invokeModel({
            job,
            knowledgebase,
            stage: 'links',
            ordinal,
            inputFingerprint: hashKnowledgeWikiValue(grounded),
            messages: knowledgeWikiRelationsMessages(grounded),
            response: { format: 'json', schema: knowledgeWikiRelationsSchema },
            parse: (value) => knowledgeWikiRelationsSchema.parse(value)
        })
        // Validate references after saving the known provider result, just like citation validation.
        return applyKnowledgeWikiRelations(grounded, relations)
    }

    async invokeReduceModel(
        job: KnowledgeWikiJob,
        knowledgebase: Knowledgebase,
        page: KnowledgeWikiPage,
        sources: KnowledgeWikiReduceSource[],
        inputFingerprint: string
    ) {
        const output = await this.invokeModel<KnowledgeWikiReduceModelOutput>({
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
                    evidence: [
                        ...new Map(
                            source.evidence.map(({ sourceChunkId, quote }) => [sourceChunkId, { sourceChunkId, quote }])
                        ).values()
                    ]
                })),
                config: normalizeKnowledgebaseWikiConfig(knowledgebase.wikiConfig)
            }),
            response: {
                format: 'markdown',
                parseText: (text) => parseKnowledgeWikiReduceText(text, page.canonicalName)
            },
            parse: parseKnowledgeWikiReduceOutput
        })
        this.logger.log(
            JSON.stringify({
                event: 'wiki.reduce.parsed',
                knowledgebaseId: knowledgebase.id,
                jobId: job.id,
                pageId: page.id,
                pageKey: page.pageKey,
                generationAttempt: job.generationAttempt,
                inputFingerprint,
                contentLength: output.contentMarkdown.length,
                lineFeedCount: output.contentMarkdown.split('\n').length - 1,
                output
            })
        )
        return output
    }

    invokeDedupModel(
        job: KnowledgeWikiJob,
        knowledgebase: Knowledgebase,
        input: KnowledgeWikiDedupModelInput,
        ordinal: number
    ) {
        const messages = buildKnowledgeWikiDedupMessages(input)
        const run = (correction: boolean): Promise<KnowledgeWikiDedupModelOutput> =>
            this.invokeModel<KnowledgeWikiDedupModelOutput>({
                job,
                knowledgebase,
                stage: 'dedup',
                ordinal,
                inputFingerprint: hashKnowledgeWikiValue(
                    correction ? { input, correction: 'identity-target-v1' } : input
                ),
                messages: correction
                    ? messages.map((message) =>
                          message.role === 'system'
                              ? {
                                    ...message,
                                    content: `${message.content}\nThe previous response failed validation. Re-evaluate the item against the supplied candidates. Return JSON with decision same, different or uncertain and a short non-empty reason. For same, identityId must exactly match one candidates[].id; for different or uncertain, identityId must be null. Never match the item to itself or invent a target.`
                                }
                              : message
                      )
                    : messages,
                response: {
                    format: 'json',
                    schema: createKnowledgeWikiDedupOutputSchema(input),
                    // One correction is separately reserved, journaled and billed; replay uses the same request IDs.
                    retryInvalidResponse: correction ? undefined : () => run(true)
                },
                parse: (value) => parseKnowledgeWikiDedupOutput(value, input)
            })
        return run(false)
    }

    invokeClassificationModel(
        job: KnowledgeWikiJob,
        knowledgebase: Knowledgebase,
        input: WikiClassificationModelInput
    ) {
        return this.invokeModel<KnowledgeWikiClassificationOutput>({
            job,
            knowledgebase,
            stage: 'classify',
            ordinal: 0,
            inputFingerprint: hashKnowledgeWikiValue(input),
            messages: wikiClassificationMessages(input),
            response: { format: 'json', schema: wikiClassificationSchema },
            parse: (value) => parseWikiClassification(value, input)
        })
    }

    invokeTaxonomyModel(job: KnowledgeWikiJob, knowledgebase: Knowledgebase, input: WikiTaxonomyModelInput) {
        return this.invokeModel<KnowledgeWikiTaxonomyOutput>({
            job,
            knowledgebase,
            stage: 'classify',
            ordinal: 0,
            inputFingerprint: hashKnowledgeWikiValue(input),
            messages: wikiTaxonomyMessages(input),
            response: {
                format: 'json',
                schema: createWikiTaxonomyResponseSchema(input),
                parseResponse: (value) => parseWikiTaxonomyResponse(value, input)
            },
            parse: (value) => parseWikiTaxonomy(value, input)
        })
    }

    async settleFailedResponseBilling(job: KnowledgeWikiJob, knowledgebase: Knowledgebase) {
        const pending = await this.invocationRepository.find({
            where: {
                jobId: job.id,
                knowledgebaseId: knowledgebase.id,
                generationAttempt: job.generationAttempt,
                status: 'failed',
                errorCode: 'model_response_invalid',
                billingStatus: In(['pending', 'failed'])
            }
        })
        if (!pending.length) return
        const model = resolveKnowledgeWikiModel(knowledgebase)
        if (!isUsableKnowledgeWikiModel(model)) {
            throw new Error(
                t('server-ai:Error.KnowledgebaseWikiModelRequired', {
                    defaultValue: 'A usable Wiki model or general LLM is required'
                })
            )
        }
        for (const invocation of pending) await this.deliverBilling(invocation, knowledgebase, model)
    }

    private async invokeModel<T extends KnowledgeWikiModelOutput>(input: {
        job: KnowledgeWikiJob
        knowledgebase: Knowledgebase
        stage: KnowledgeWikiModelInvocation['stage']
        ordinal: number
        inputFingerprint: string
        messages: Array<{ role: 'system' | 'user'; content: string }>
        response: WikiModelResponse<T>
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
            if (input.stage === 'reduce') {
                this.logger.log(
                    JSON.stringify({
                        event: 'wiki.reduce.cache_hit',
                        knowledgebaseId: input.knowledgebase.id,
                        jobId: input.job.id,
                        generationAttempt: input.job.generationAttempt,
                        inputFingerprint: input.inputFingerprint,
                        invocationId: invocation.id,
                        requestId
                    })
                )
            }
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
        const retryNotExecuted = invocation.status === 'failed' && invocation.reconciliationStatus === 'not_executed'
        if (invocation.status === 'failed' && invocation.errorCode === 'model_response_invalid') {
            await this.deliverBilling(invocation, input.knowledgebase, model)
            if (input.response.format === 'json' && input.response.retryInvalidResponse) {
                return input.response.retryInvalidResponse()
            }
            throw this.invalidResponseError()
        }
        if (invocation.status !== 'prepared' && !retryNotExecuted) {
            throw this.indeterminateError()
        }
        let usage: UsageTotals = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
        const running = {
            status: 'running',
            reconciliationStatus: 'not_available',
            errorCode: null,
            error: null,
            completedAt: null,
            billingStatus: 'pending'
        } satisfies Partial<KnowledgeWikiModelInvocation>
        const claimed = await this.invocationRepository.update(
            {
                id: invocation.id,
                status: retryNotExecuted ? 'failed' : 'prepared',
                ...(retryNotExecuted ? { reconciliationStatus: 'not_executed' as const } : {})
            },
            running
        )
        if (!claimed.affected) throw this.indeterminateError()
        Object.assign(invocation, running)
        invocation.status = 'running'
        let invocationStarted = false
        let responseReceived = false
        try {
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
            const options: RunnableConfig | undefined =
                input.stage === 'reduce'
                    ? {
                          // Temporary diagnostics: log the SDK model text before Wiki parsing and validation.
                          callbacks: [
                              {
                                  name: 'wiki-reduce-diagnostic',
                                  handleLLMEnd: (output, runId) => {
                                      this.logger.log(
                                          JSON.stringify({
                                              event: 'wiki.reduce.raw',
                                              knowledgebaseId: input.knowledgebase.id,
                                              jobId: input.job.id,
                                              pageKey: input.job.pageKey,
                                              generationAttempt: input.job.generationAttempt,
                                              inputFingerprint: input.inputFingerprint,
                                              invocationId: invocation.id,
                                              requestId,
                                              runId,
                                              model: model.model,
                                              textStats: output.generations.map((generations) =>
                                                  generations.map(({ text }) => ({
                                                      length: text.length,
                                                      lineFeedCount: text.split('\n').length - 1,
                                                      escapedLineFeedCount: text.split('\\n').length - 1
                                                  }))
                                              ),
                                              output
                                          })
                                      )
                                  }
                              }
                          ]
                      }
                    : undefined
            let output: T
            if (input.response.format === 'markdown') {
                invocationStarted = true
                const message = await client.invoke(input.messages, options)
                responseReceived = true
                output = input.response.parseText(extractTextFromMessageContent(message.content))
            } else {
                // Compile before invoking: some SDKs defer Zod conversion until request construction.
                const structured = client.withStructuredOutput(toJsonSchema(input.response.schema), {
                    name: `knowledge_wiki_${input.stage}`
                })
                invocationStarted = true
                const rawOutput = await structured.invoke(input.messages, options)
                responseReceived = true
                try {
                    output = input.response.parseResponse
                        ? input.response.parseResponse(rawOutput)
                        : input.parse(rawOutput)
                } catch (error) {
                    if (input.stage === 'classify') {
                        this.logger.warn(
                            JSON.stringify({
                                event: 'wiki.classification.response_invalid',
                                knowledgebaseId: input.knowledgebase.id,
                                jobId: input.job.id,
                                invocationId: invocation.id,
                                generationAttempt: input.job.generationAttempt,
                                reason:
                                    error instanceof WikiTaxonomyResponseError ? error.reason : getErrorMessage(error),
                                detail: error instanceof WikiTaxonomyResponseError ? error.detail : undefined,
                                output: rawOutput
                            })
                        )
                    }
                    throw error
                }
            }
            invocation.status = 'succeeded'
            invocation.structuredOutput = output
            invocation.tokenUsage = { ...usage, estimatedTokens: invocation.tokenUsage?.estimatedTokens }
            invocation.completedAt = new Date()
            await this.invocationRepository.save(invocation)
            await this.deliverBilling(invocation, input.knowledgebase, model)
            return output
        } catch (error) {
            if (invocation.status === 'running') {
                if (responseReceived) {
                    invocation.status = 'failed'
                    invocation.reconciliationStatus = 'not_available'
                    invocation.errorCode = 'model_response_invalid'
                    invocation.error = getErrorMessage(error).slice(0, MAX_ERROR_LENGTH)
                    invocation.tokenUsage = { ...usage, estimatedTokens: invocation.tokenUsage?.estimatedTokens }
                    invocation.completedAt = new Date()
                    await this.invocationRepository.save(invocation)
                    await this.deliverBilling(invocation, input.knowledgebase, model)
                    if (input.response.format === 'json' && input.response.retryInvalidResponse) {
                        return input.response.retryInvalidResponse()
                    }
                    throw error
                }
                const rejected = invocationStarted && !responseReceived && isProviderRequestRejected(error)
                const notExecuted = !invocationStarted || rejected
                invocation.status = notExecuted ? 'failed' : 'indeterminate'
                invocation.reconciliationStatus = notExecuted ? 'not_executed' : 'indeterminate'
                invocation.errorCode = !invocationStarted
                    ? 'model_preparation_failed'
                    : rejected
                      ? 'provider_request_rejected'
                      : 'provider_outcome_indeterminate'
                if (notExecuted) invocation.billingStatus = 'delivered'
                invocation.error = getErrorMessage(error).slice(0, MAX_ERROR_LENGTH)
                invocation.completedAt = new Date()
                await this.invocationRepository.save(invocation)
            }
            throw error
        }
    }

    private invalidResponseError() {
        return new Error(
            t('server-ai:Error.KnowledgebaseWikiModelResponseInvalid', {
                defaultValue: 'The Wiki model returned invalid content. Retry the failed generation task.'
            })
        )
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
            if (invocation.status === 'succeeded') invocation.error = null
            await this.invocationRepository.save(invocation)
        } catch (error) {
            invocation.billingStatus = 'failed'
            if (invocation.errorCode !== 'model_response_invalid') {
                invocation.errorCode = 'billing_delivery_failed'
                invocation.error = getErrorMessage(error).slice(0, MAX_ERROR_LENGTH)
            }
            await this.invocationRepository.save(invocation)
            throw error
        }
    }
}
