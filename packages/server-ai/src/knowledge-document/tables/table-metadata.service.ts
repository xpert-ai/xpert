// Model results are paid work: persist them before indexing and reuse them on retry.
// A generation owns one source/configuration and publication epoch; stale work must never publish.
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import {
    AiModelTypeEnum,
    IKnowledgebase,
    IKnowledgeDocument,
    isNativeKnowledgeTableDocument,
    isKnowledgeTableMetadata,
    KBDocumentStatusEnum,
    KnowledgeTableMetadata,
    KnowledgeTableResult,
    KnowledgeTableSource
} from '@xpert-ai/contracts'
import { getErrorMessage } from '@xpert-ai/server-common'
import { RequestContext } from '@xpert-ai/server-core'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { randomUUID } from 'node:crypto'
import { Repository } from 'typeorm'
import { t } from 'i18next'
import { AgentMiddlewareRuntimeService } from '../../shared/agent/middleware-runtime'
import { extractTextFromMessageContent } from '../../shared/agent/stream-text'
import { KnowledgeDocument } from '../document.entity'
import { computeStableHash, resolveKnowledgeDocumentSourceHash } from '../document-hash'
import { resolveKnowledgeDocumentParserConfig } from '../parser-config'
import { parseTableModelResult, projectTableMetadata, tableModelBatches } from './table-metadata'
import { parseTableLanguage, tableLanguageMessages } from './table-language'
import { tableSummaryBatches, tableSummaryMergeBatches, parseTableSummary } from './table-summary'
import { tableMetadataInputHash } from './table-metadata-input-hash'
export { tableMetadataInputHash } from './table-metadata-input-hash'

export class TableMetadataStaleError extends Error {
    constructor() {
        super(t('server-ai:Error.KnowledgeTableMetadataStale'))
    }
}

@Injectable()
export class KnowledgeTableMetadataService {
    constructor(
        @InjectRepository(KnowledgeDocument) private readonly documents: Repository<KnowledgeDocument>,
        private readonly models: AgentMiddlewareRuntimeService
    ) {}

    readonly project = projectTableMetadata

    canSkip(document: IKnowledgeDocument, knowledgebase: IKnowledgebase) {
        if (!isNativeKnowledgeTableDocument(document)) return true
        const state = readTableState(document)
        return Boolean(
            resolveKnowledgeDocumentSourceHash(document) &&
            state?.status === 'ready' &&
            state.resultHash &&
            state.resultHash === state.appliedResultHash &&
            state.inputHash === tableMetadataInputHash(document, knowledgebase)
        )
    }

    async prepare(
        document: IKnowledgeDocument,
        knowledgebase: IKnowledgebase,
        tables: KnowledgeTableSource[],
        sourceFingerprint?: string
    ): Promise<KnowledgeTableMetadata> {
        const config = resolveKnowledgeDocumentParserConfig(document)
        const inputHash = tableMetadataInputHash(document, knowledgebase)
        const previous = readTableState(document)
        const reusableSource = sourceFingerprint
            ? previous?.sourceFingerprint === sourceFingerprint
            : Boolean(resolveKnowledgeDocumentSourceHash(document)) && !previous?.sourceFingerprint
        if (
            reusableSource &&
            previous?.inputHash === inputHash &&
            ['generated', 'ready'].includes(previous.status) &&
            previous.resultHash
        ) {
            await this.assertCurrent(document, previous)
            return structuredClone(previous)
        }
        const resume = reusableSource && previous?.inputHash === inputHash && previous.status !== 'skipped'
        let state: KnowledgeTableMetadata = {
            schemaVersion: 1,
            status: 'generating',
            inputHash,
            sourceFingerprint,
            language: resume ? previous.language : undefined,
            completedColumns: resume
                ? structuredClone(
                      previous.completedColumns ??
                          Object.fromEntries(
                              previous.tables.map((table) => [
                                  table.tableId,
                                  table.columns.map((column) => column.columnId)
                              ])
                          )
                  )
                : {},
            generationId: randomUUID(),
            updatedAt: new Date().toISOString(),
            tables:
                reusableSource && previous?.inputHash === inputHash && previous.status !== 'skipped'
                    ? structuredClone(previous.tables)
                    : []
        }
        if (!isNativeKnowledgeTableDocument(document)) {
            state = { ...state, status: 'skipped', reason: 'unsupported', tables: [] }
        } else if (!knowledgebase.chatModel?.copilotId || !knowledgebase.chatModel.model) {
            state = { ...state, status: 'skipped', reason: 'missing_model', tables: tableDefinitions(tables) }
        } else if (
            !tables.some(
                (table) =>
                    table.rowCount > 0 &&
                    table.columns.some(
                        (column) => !config.indexedFields?.length || config.indexedFields.includes(column.key)
                    )
            )
        ) {
            state = { ...state, status: 'skipped', reason: 'no_data', tables: tableDefinitions(tables) }
        }
        await this.writeState(document, state, previous?.generationId)
        if (state.status === 'skipped') return state
        try {
            const model = knowledgebase.chatModel
            const contextSize = model.options?.context_size ?? model.referencedModel?.options?.context_size ?? 16384
            const sources = tables.filter(
                (table) =>
                    table.rowCount > 0 &&
                    table.columns.some(
                        (column) => !config.indexedFields?.length || config.indexedFields.includes(column.key)
                    )
            )
            const makePlans = (language: string) =>
                sources.map((source) => ({
                    source,
                    summaries: tableSummaryBatches(source, config.indexedFields, language, contextSize),
                    batches: tableModelBatches(
                        source,
                        config.indexedFields,
                        config.tableMetadataRequirements ?? '',
                        contextSize,
                        language
                    )
                }))
            // Validate all source headers and instructions before spending model calls on any table.
            makePlans(state.language ?? 'und')
            const languageMessages = state.language
                ? undefined
                : tableLanguageMessages(sources, config.indexedFields, contextSize)
            const client = await this.models.createModelClient<BaseChatModel>(
                {
                    ...structuredClone(model),
                    modelType: AiModelTypeEnum.LLM,
                    options: {
                        ...structuredClone(model.options),
                        max_tokens: Math.max(128, Math.min(4096, Math.floor(contextSize / 4)))
                    }
                },
                {},
                {
                    tenantId: document.tenantId,
                    organizationId: document.organizationId,
                    userId: RequestContext.currentUserId()
                }
            )
            if (!state.language) {
                await this.assertCurrent(document, state)
                const response = await client.invoke(languageMessages, {
                    signal: AbortSignal.timeout(120000),
                    runName: 'knowledge-table-language',
                    metadata: { documentId: document.id, generationId: state.generationId }
                })
                state.language = parseTableLanguage(extractTextFromMessageContent(response.content))
                await this.writeState(document, state, state.generationId)
            }
            const language = state.language
            const plans = makePlans(language)
            for (const { source, batches, summaries } of plans) {
                for (const batch of batches) {
                    if (
                        batch.source.columns.every((column) =>
                            state.completedColumns[source.tableId]?.includes(column.columnId)
                        )
                    )
                        continue
                    await this.assertCurrent(document, state)
                    let result: KnowledgeTableResult | undefined
                    for (let attempt = 0; attempt < 2; attempt++) {
                        await this.assertCurrent(document, state)
                        const response = await client.invoke(
                            attempt
                                ? [
                                      ...batch.messages,
                                      {
                                          role: 'user' as const,
                                          content:
                                              'The previous output failed validation. Return corrected JSON in the requested language. Remove all copied sample values and unsupported meanings. Units and code meanings must be exact excerpts of the supplied evidence, otherwise leave them empty.'
                                      }
                                  ]
                                : batch.messages,
                            {
                                signal: AbortSignal.timeout(120000),
                                runName: 'knowledge-table-metadata',
                                metadata: {
                                    documentId: document.id,
                                    tableId: source.tableId,
                                    generationId: state.generationId
                                }
                            }
                        )
                        try {
                            result = parseTableModelResult(
                                extractTextFromMessageContent(response.content),
                                batch.source,
                                config.tableMetadataRequirements ?? '',
                                language
                            )
                            break
                        } catch (error) {
                            if (attempt === 1) throw error
                        }
                    }
                    if (!result) throw new Error(t('server-ai:Error.KnowledgeTableMetadataInvalidResponse'))
                    state.tables = mergeTableResult(state.tables, result)
                    state.completedColumns[source.tableId] = [
                        ...new Set([
                            ...(state.completedColumns[source.tableId] ?? []),
                            ...result.columns.map((column) => column.columnId)
                        ])
                    ]
                    await this.writeState(document, state, state.generationId)
                }
                if (batches.length > 1) {
                    let pending = summaries
                    let results: string[]
                    do {
                        results = []
                        for (const batch of pending) {
                            for (let attempt = 0; attempt < 2; attempt++) {
                                await this.assertCurrent(document, state)
                                const response = await client.invoke(
                                    attempt
                                        ? [
                                              ...batch.messages,
                                              {
                                                  role: 'user' as const,
                                                  content:
                                                      'Correct the summary: follow the requested language and output token limit; omit numeric claims. Return JSON with summary and an empty columns array.'
                                              }
                                          ]
                                        : batch.messages,
                                    {
                                        signal: AbortSignal.timeout(120000),
                                        runName: 'knowledge-table-summary',
                                        metadata: {
                                            documentId: document.id,
                                            tableId: source.tableId,
                                            generationId: state.generationId
                                        }
                                    }
                                )
                                try {
                                    results.push(
                                        parseTableSummary(
                                            extractTextFromMessageContent(response.content),
                                            batch.source,
                                            language,
                                            contextSize
                                        )
                                    )
                                    break
                                } catch (error) {
                                    if (attempt === 1) throw error
                                }
                            }
                        }
                        pending =
                            results.length > 1 ? tableSummaryMergeBatches(source, results, language, contextSize) : []
                    } while (pending.length)
                    state.tables = state.tables.map((table) =>
                        table.tableId === source.tableId ? { ...table, summary: results[0] ?? '' } : table
                    )
                    await this.writeState(document, state, state.generationId)
                }
            }
            state.tables = tables.map((source) => {
                const generated = state.tables.find((table) => table.tableId === source.tableId)
                const { samples: _samples, ...definition } = source
                return {
                    ...definition,
                    summary: generated?.summary ?? '',
                    columns: source.columns.map(
                        (column) =>
                            generated?.columns.find((item) => item.columnId === column.columnId) ?? {
                                ...column,
                                description: ''
                            }
                    )
                }
            })
            state = {
                ...state,
                status: 'generated',
                resultHash: computeStableHash({ inputHash, sourceFingerprint, tables: state.tables })
            }
            await this.writeState(document, state, state.generationId)
        } catch (error) {
            if (error instanceof TableMetadataStaleError) throw error
            state = { ...state, status: 'failed', error: getErrorMessage(error).slice(0, 1000) }
            const generated = state.tables
            state.tables = tableDefinitions(tables).map((table) => {
                const partial = generated.find((result) => result.tableId === table.tableId)
                return {
                    ...table,
                    summary: partial?.summary ?? '',
                    columns: table.columns.map(
                        (column) => partial?.columns.find((result) => result.columnId === column.columnId) ?? column
                    )
                }
            })
            await this.writeState(document, state, state.generationId)
        }
        return state
    }

    async markApplied(document: IKnowledgeDocument, state: KnowledgeTableMetadata | undefined) {
        if (!state?.resultHash || !['generated', 'ready'].includes(state.status)) return false
        const published: KnowledgeTableMetadata = { ...state, status: 'ready', appliedResultHash: state.resultHash }
        await this.writeState(document, published, state.generationId, false)
        Object.assign(state, published)
        return true
    }

    async assertIndexCurrent(document: IKnowledgeDocument, state: KnowledgeTableMetadata) {
        await this.assertCurrent(document, state, false)
    }

    private async assertCurrent(
        document: IKnowledgeDocument,
        state: KnowledgeTableMetadata,
        requireSourceVersion = true
    ) {
        const current = await this.loadCurrent(document)
        if (
            !current ||
            current.disabled ||
            current.status === KBDocumentStatusEnum.CANCEL ||
            (requireSourceVersion && current.version !== document.version) ||
            current.hardDeletePendingAt ||
            (current.jobId ?? null) !== (document.jobId ?? null) ||
            (current.publicationEpoch ?? 0) !== (document.publicationEpoch ?? 0) ||
            tableMetadataInputHash(current, current.knowledgebase) !== state.inputHash ||
            readTableState(current)?.generationId !== state.generationId
        )
            throw new TableMetadataStaleError()
        return current
    }

    private loadCurrent(document: IKnowledgeDocument) {
        return this.documents.findOne({
            where: {
                id: document.id,
                tenantId: document.tenantId,
                organizationId: document.organizationId,
                knowledgebaseId: document.knowledgebaseId
            },
            relations: ['knowledgebase', 'knowledgebase.chatModel', 'knowledgebase.chatModel.referencedModel']
        })
    }

    private async writeState(
        document: IKnowledgeDocument,
        state: KnowledgeTableMetadata,
        expectedGeneration?: string,
        requireSourceVersion = true
    ) {
        const current = await this.loadCurrent(document)
        if (
            !current ||
            current.disabled ||
            current.hardDeletePendingAt ||
            current.status === KBDocumentStatusEnum.CANCEL ||
            (requireSourceVersion && current.version !== document.version) ||
            (current.jobId ?? null) !== (document.jobId ?? null) ||
            (current.publicationEpoch ?? 0) !== (document.publicationEpoch ?? 0) ||
            readTableState(current)?.generationId !== expectedGeneration ||
            tableMetadataInputHash(current, current.knowledgebase) !== state.inputHash
        )
            throw new TableMetadataStaleError()
        state.updatedAt = new Date().toISOString()
        const saved = await this.documents
            .createQueryBuilder()
            .update(KnowledgeDocument)
            .set({
                metadata: () =>
                    `jsonb_set(COALESCE("metadata", '{}'::jsonb), '{tableMetadata}', CAST(:nextState AS jsonb), true)`,
                version: () => '"version"'
            })
            .where('"id" = :documentId AND "tenantId" = :tenantId AND "organizationId" = :organizationId', {
                documentId: current.id,
                tenantId: current.tenantId,
                organizationId: current.organizationId
            })
            .andWhere('"version" = :version', { version: current.version })
            .andWhere('"deletedAt" IS NULL AND "hardDeletePendingAt" IS NULL')
            .andWhere('"jobId" IS NOT DISTINCT FROM :jobId', { jobId: document.jobId ?? null })
            .andWhere('COALESCE("disabled", false) = false AND "status" IS DISTINCT FROM :cancelled', {
                cancelled: KBDocumentStatusEnum.CANCEL
            })
            .andWhere('COALESCE("publicationEpoch", 0) = :epoch', { epoch: document.publicationEpoch ?? 0 })
            .andWhere('"metadata" -> \'tableMetadata\' IS NOT DISTINCT FROM CAST(:previousState AS jsonb)')
            .setParameters({
                previousState: current.metadata?.tableMetadata ? JSON.stringify(current.metadata.tableMetadata) : null,
                nextState: JSON.stringify(state)
            })
            .execute()
        if (!saved.affected) throw new TableMetadataStaleError()
        document.metadata = { ...(document.metadata ?? {}), tableMetadata: structuredClone(state) }
    }
}

function readTableState(document: IKnowledgeDocument) {
    const value = document.metadata?.tableMetadata
    return isKnowledgeTableMetadata(value) ? value : undefined
}

function tableDefinitions(tables: KnowledgeTableSource[]): KnowledgeTableResult[] {
    return tables.map(({ samples: _samples, ...table }) => ({
        ...table,
        summary: '',
        columns: table.columns.map((column) => ({ ...column, description: '' }))
    }))
}

function mergeTableResult(tables: KnowledgeTableResult[], result: KnowledgeTableResult) {
    const existing = tables.find((table) => table.tableId === result.tableId)
    if (!existing) return [...tables, result]
    const columns = new Map(existing.columns.map((column) => [column.columnId, column]))
    result.columns.forEach((column) => columns.set(column.columnId, column))
    const merged = {
        ...existing,
        summary: existing.summary || result.summary,
        columns: [...columns.values()].sort((left, right) => left.column - right.column)
    }
    return tables.map((table) => (table.tableId === result.tableId ? merged : table))
}
