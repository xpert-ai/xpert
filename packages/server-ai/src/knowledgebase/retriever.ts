import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { CallbackManager, parseCallbackConfigArg } from '@langchain/core/callbacks/manager'
import { DocumentInterface } from '@langchain/core/documents'
import { BaseRetriever } from '@langchain/core/retrievers'
import { ensureConfig, RunnableConfig } from '@langchain/core/runnables'
import { tool } from '@langchain/core/tools'
import {
    ChatMessageEventTypeEnum,
    DocumentMetadata,
    IKnowledgebase,
    KnowledgeFilterNode,
    KnowledgeFilterSources,
    TKBRecallParams,
    TKBRetrievalSettings
} from '@xpert-ai/contracts'
import { getErrorMessage } from '@xpert-ai/server-common'
import { Logger } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { instanceToPlain } from 'class-transformer'
import { omit } from 'lodash'
import z from 'zod'
import { DocumentChunkDTO } from '../knowledge-document/dto'
import { formatKnowledgebaseRetrievalToolOutput, KNOWLEDGEBASE_CITATION_MARKDOWN_INSTRUCTION } from './citation'
import { createKnowledgeFilterRegistry } from './filter'
import {
    KnowledgebaseGetOneQuery,
    KnowledgeFilterValueOptionsQuery,
    KnowledgeFolderOptionsQuery,
    KnowledgeGraphExploreQuery,
    KnowledgeSearchQuery
} from './queries'
import { KnowledgeSearchResult } from './queries/knowledge-search.query'

type KnowledgeRetrieverConfigurable = {
    requestFilter?: KnowledgeFilterNode
    dynamicFilter?: KnowledgeFilterNode
    variables?: Record<string, unknown>
    runtimeState?: Record<string, unknown>
}

type KnowledgebaseToolContext = Pick<
    IKnowledgebase,
    | 'id'
    | 'name'
    | 'description'
    | 'metadataSchema'
    | 'workspaceId'
    | 'tenantId'
    | 'organizationId'
    | 'graphRag'
    | 'graphStatus'
>

/**
 * Docs Retriever for signle Knowledgebase
 */
export class KnowledgeRetriever extends BaseRetriever {
    lc_namespace = ['xpert', 'knowledgenase']

    readonly #logger = new Logger(KnowledgeRetriever.name)
    #toolKnowledgebase?: Promise<KnowledgebaseToolContext>

    tenantId: string
    organizationId: string

    constructor(
        private readonly queryBus: QueryBus,
        private readonly knowledgebaseId: string,
        private readonly options?: {
            recall: TKBRecallParams
            retrieval?: TKBRetrievalSettings
        }
    ) {
        super()
    }

    async invoke(query: string, config?: RunnableConfig<KnowledgeRetrieverConfigurable>): Promise<DocumentInterface[]> {
        const parsedConfig = ensureConfig(parseCallbackConfigArg(config))
        this.#logger.debug(`Retrieving knowledge documents for query: ${query}`)
        const callbackManager_ = await CallbackManager.configure(
            parsedConfig.callbacks,
            this.callbacks,
            parsedConfig.tags,
            this.tags,
            parsedConfig.metadata,
            this.metadata,
            { verbose: this.verbose }
        )
        const runManager = await callbackManager_?.handleRetrieverStart(
            this.toJSON(),
            query,
            parsedConfig.runId,
            undefined,
            undefined,
            undefined,
            parsedConfig.runName
        )
        try {
            const result = await this.retrieveDetailed(
                query,
                {
                    fixed: this.options?.retrieval?.filtering?.fixed,
                    request: config?.configurable?.requestFilter,
                    dynamic: config?.configurable?.dynamicFilter
                },
                config?.configurable?.variables ?? config?.configurable?.runtimeState
            )
            const results = result.documents

            await runManager?.handleRetrieverEnd(results)
            return results
        } catch (error) {
            await runManager?.handleRetrieverError(error)
            throw error
        }
    }

    async retrieve(
        query: string,
        filters?: KnowledgeFilterSources,
        variables?: Record<string, unknown>
    ): Promise<DocumentInterface<DocumentMetadata>[]> {
        return (await this.retrieveDetailed(query, filters, variables)).documents
    }

    async retrieveDetailed(
        query: string,
        filters?: KnowledgeFilterSources,
        variables?: Record<string, unknown>
    ): Promise<KnowledgeSearchResult> {
        this.metadata = { ...(this.metadata ?? {}), knowledgebaseId: this.knowledgebaseId }

        try {
            const result = await this.queryBus.execute<KnowledgeSearchQuery, KnowledgeSearchResult>(
                new KnowledgeSearchQuery({
                    tenantId: this.tenantId,
                    organizationId: this.organizationId,
                    knowledgebases: this.knowledgebaseId ? [this.knowledgebaseId] : [],
                    query,
                    score: this.options?.recall.score,
                    k: this.options?.recall.topK,
                    source: 'retriever',
                    filters: {
                        fixed: filters?.fixed ?? this.options?.retrieval?.filtering?.fixed,
                        request: filters?.request,
                        dynamic: filters?.dynamic
                    },
                    variables,
                    retrieval: this.options?.retrieval
                })
            )
            return {
                ...result,
                documents: result.documents.map(
                    (doc) =>
                        instanceToPlain(
                            new DocumentChunkDTO({ ...doc, metadata: omit(doc.metadata, 'children') })
                        ) as DocumentInterface<DocumentMetadata>
                )
            }
        } catch (error) {
            await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_RETRIEVER_ERROR, {
                knowledgebaseId: this.knowledgebaseId,
                error: getErrorMessage(error)
            })
            throw error
        }
    }

    async toTool(toolOptions?: { name?: string; description?: string }) {
        const retrieval = this.options?.retrieval
        const knowledgebase = await this.getToolKnowledgebase()
        const registry = createKnowledgeFilterRegistry(knowledgebase)
        const agentFields = [...registry.values()].filter((field) => field.agentVisible)
        const fieldCatalog = agentFields
            .map(
                (field) =>
                    `${field.field}: type=${field.type}; operators=${field.operators.join(', ')}` +
                    (field.enumValues?.length ? `; enum=${field.enumValues.join(', ')}` : '') +
                    (field.description ? `; ${field.description}` : '')
            )
            .join('\n')
        const allowsAgentFilter = retrieval?.filtering?.agent?.enabled === true
        const schema = z.object({
            input: z.string().describe('Key information from the question to retrieve.'),
            ...(allowsAgentFilter
                ? {
                      dynamicFilter: createDynamicFilterToolInputSchema(fieldCatalog)
                          .optional()
                          .describe(
                              'Optional structured filter inferred from the question. Omit it when the user intent is uncertain. ' +
                                  'Prefer a JSON object. A JSON-encoded object string is also accepted for model-provider compatibility. ' +
                                  'Condition shape: {"kind":"condition","field":"document.folderPath","operator":"under",' +
                                  '"value":{"kind":"literal","value":"Water Resources"}}. ' +
                                  'Group shape: {"kind":"group","operator":"and","children":[...conditions or groups...]}. ' +
                                  'Do not use variables in this filter. Available fields:\n' +
                                  fieldCatalog
                          )
                  }
                : {})
        })

        return tool(
            async (params, config) => {
                const result = await this.retrieveDetailed(
                    params.input,
                    {
                        fixed: retrieval?.filtering?.fixed,
                        dynamic: allowsAgentFilter ? normalizeDynamicFilterToolInput(params.dynamicFilter) : undefined
                    },
                    config?.configurable?.runtimeState as Record<string, unknown> | undefined
                )

                return formatKnowledgebaseRetrievalToolOutput(
                    result.documents,
                    this.knowledgebaseId,
                    result.diagnostics
                )
            },
            {
                ...toolOptions,
                name: toolOptions?.name ?? `retriever-${this.knowledgebaseId}`,
                description:
                    `Get knowledges from knowledgebase '${knowledgebase.name}', it be described by ` +
                    knowledgebase.description +
                    `. This retrieval is always constrained by administrator-managed boundaries that cannot be changed by the Agent. ` +
                    (allowsAgentFilter
                        ? `Use dynamicFilter only when the user question clearly identifies filter values. ` +
                          `If an exact live field value is uncertain, call '${this.filterOptionsToolName()}' first; ` +
                          `never invent folder paths, metadata values, file types, or other selectable values. ` +
                          `If a valid filter returns zero hits and retryableWithoutDynamic is true, ` +
                          `decide whether to call again without dynamicFilter. `
                        : '') +
                    (knowledgebase.graphRag?.enabled
                        ? `When relevant entities or relationships are ambiguous, first call ` +
                          `'knowledge-graph-explorer-${this.knowledgebaseId}' and use its suggestedRetrievalQuery here. `
                        : '') +
                    `The result includes chunks, citations, and retrieval diagnostics. ${KNOWLEDGEBASE_CITATION_MARKDOWN_INSTRUCTION}`,
                schema
            }
        )
    }

    /**
     * Companion discovery tool for Agent-managed filters. It lets an Agent inspect
     * discoverable fields and their live values without exposing the fixed boundary.
     */
    async toFilterOptionsTool(toolOptions?: { name?: string; description?: string }) {
        const retrieval = this.options?.retrieval
        const knowledgebase = await this.getToolKnowledgebase()
        const registry = createKnowledgeFilterRegistry(knowledgebase)
        const discoverableFields = [...registry.values()]
            .filter((definition) => definition.agentVisible)
            .map((definition) => ({
                field: definition.field,
                type: definition.type,
                operators: definition.operators,
                optionKind: resolveKnowledgeFilterOptionKind(definition.field, definition.type),
                ...(definition.description ? { description: definition.description } : {}),
                ...(definition.enumValues?.length ? { configuredEnumValues: definition.enumValues } : {})
            }))
        const schema = z.object({
            field: z
                .string()
                .max(512)
                .optional()
                .describe(
                    'Registered filter field whose live values should be queried. Omit it to list all discoverable fields first.'
                ),
            search: z
                .string()
                .max(512)
                .optional()
                .describe(
                    'Optional case-insensitive text used to narrow live values. Omit it to list the first values.'
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(100)
                .optional()
                .describe('Maximum number of folder options to return. Defaults to 50 and cannot exceed 100.'),
            offset: z
                .number()
                .int()
                .min(0)
                .optional()
                .describe(
                    'Pagination offset. Omit it for the first page; use nextOffset from the result for the next page.'
                )
        })

        return tool(
            async (params, config) => {
                if (!params.field) {
                    return JSON.stringify({
                        knowledgebaseId: this.knowledgebaseId,
                        mode: 'fields',
                        fields: discoverableFields,
                        instructions:
                            `Choose a field whose value is uncertain, then call this tool again with that field. ` +
                            `Only use returned live values in retriever-${this.knowledgebaseId} dynamicFilter conditions.`
                    })
                }
                const definition = registry.get(params.field)
                if (!definition?.agentVisible) {
                    return JSON.stringify({
                        knowledgebaseId: this.knowledgebaseId,
                        mode: 'error',
                        errorCode: 'unknown_filter_field',
                        field: params.field,
                        availableFields: discoverableFields.map(({ field }) => field)
                    })
                }
                const commonInput = {
                    tenantId: this.tenantId,
                    organizationId: this.organizationId,
                    knowledgebaseId: this.knowledgebaseId,
                    fixedFilter: retrieval?.filtering?.fixed,
                    variables: config?.configurable?.runtimeState as Record<string, unknown> | undefined,
                    search: params.search,
                    limit: params.limit,
                    offset: params.offset
                }
                const result =
                    params.field === 'document.folderPath'
                        ? await this.queryBus.execute(
                              new KnowledgeFolderOptionsQuery({
                                  ...commonInput
                              })
                          )
                        : await this.queryBus.execute(
                              new KnowledgeFilterValueOptionsQuery({
                                  ...commonInput,
                                  field: params.field
                              })
                          )
                return JSON.stringify({
                    ...result,
                    mode: 'values',
                    field: params.field,
                    fieldType: definition.type,
                    optionKind: resolveKnowledgeFilterOptionKind(definition.field, definition.type),
                    allowedOperators: definition.operators,
                    ...(definition.enumValues?.length ? { configuredEnumValues: definition.enumValues } : {}),
                    ...(params.field === 'document.folderPath'
                        ? {
                              pathFormat:
                                  "Use folderPath exactly as returned. Paths are knowledgebase-relative, use '/' between segments, and have no leading or trailing slash."
                          }
                        : {}),
                    instructions:
                        `Choose a returned value, then pass it as a literal '${params.field}' condition to ` +
                        `retriever-${this.knowledgebaseId}. Use only an operator listed in allowedOperators.`
                })
            },
            {
                ...toolOptions,
                name: toolOptions?.name ?? this.filterOptionsToolName(),
                description:
                    toolOptions?.description ??
                    `Discover registered filter fields and their live selectable values in knowledgebase '${knowledgebase.name}'. ` +
                        `Call without field to inspect available fields, then call with a field to list values, counts, ranges, ` +
                        `or folder paths. Results include only retrievable chunks within administrator-managed fixed boundaries; ` +
                        `the boundaries themselves are never exposed. This tool is read-only and does not search document content.`,
                schema
            }
        )
    }

    /** @deprecated Use toFilterOptionsTool. */
    async toFolderOptionsTool(toolOptions?: { name?: string; description?: string }) {
        return this.toFilterOptionsTool(toolOptions)
    }

    async toGraphExplorerTool(toolOptions?: { name?: string; description?: string }) {
        const retrieval = this.options?.retrieval
        const knowledgebase = await this.getToolKnowledgebase()
        if (!knowledgebase.graphRag?.enabled) return null
        const schema = z.object({
            action: z
                .enum(['search', 'neighbors', 'evidence'])
                .describe(
                    "Use 'search' to find seed entities, 'neighbors' to expand one entity, or 'evidence' to inspect its supporting references."
                ),
            query: z
                .string()
                .max(2000)
                .optional()
                .describe(
                    "Natural-language search text for 'search'. For 'neighbors' and 'evidence', pass the original user question to preserve it in retrieval hints."
                ),
            entityId: z
                .string()
                .max(128)
                .optional()
                .describe("Entity ID returned by a previous call; required by 'neighbors' and 'evidence'."),
            depth: z
                .number()
                .int()
                .min(1)
                .max(2)
                .optional()
                .describe("Relationship hops for 'neighbors'. Defaults to 1 and cannot exceed 2."),
            take: z
                .number()
                .int()
                .min(1)
                .max(80)
                .optional()
                .describe('Maximum results for the current exploration step.'),
            ...(allowsAgentGraphFilter(retrieval)
                ? {
                      dynamicFilter: createDynamicFilterToolInputSchema(
                          [...createKnowledgeFilterRegistry(knowledgebase).values()]
                              .filter((field) => field.agentVisible)
                              .map((field) => field.field)
                              .join('\n')
                      )
                          .optional()
                          .describe(
                              'Optional literal-only Knowledge Filter V2 boundary for this graph exploration. Omit when uncertain.'
                          )
                  }
                : {})
        })
        return tool(
            async (params, config) => {
                if (params.action === 'search' && !params.query?.trim()) {
                    return JSON.stringify({
                        mode: 'error',
                        errorCode: 'graph_query_required',
                        message: "Action 'search' requires query."
                    })
                }
                if (params.action !== 'search' && !params.entityId) {
                    return JSON.stringify({
                        mode: 'error',
                        errorCode: 'graph_entity_required',
                        message: `Action '${params.action}' requires an entityId returned by an earlier graph call.`
                    })
                }
                const result = await this.queryBus.execute(
                    new KnowledgeGraphExploreQuery({
                        tenantId: this.tenantId,
                        organizationId: this.organizationId,
                        knowledgebaseId: this.knowledgebaseId,
                        action: params.action,
                        query: params.query,
                        entityId: params.entityId,
                        depth: params.depth,
                        take: params.take,
                        filters: {
                            fixed: retrieval?.filtering?.fixed,
                            dynamic: allowsAgentGraphFilter(retrieval)
                                ? normalizeDynamicFilterToolInput(params.dynamicFilter)
                                : undefined
                        },
                        variables: config?.configurable?.runtimeState as Record<string, unknown> | undefined
                    })
                )
                return JSON.stringify({
                    knowledgebaseId: this.knowledgebaseId,
                    ...result,
                    instructions:
                        `Explore repeatedly while entity or relationship intent remains ambiguous. ` +
                        `When retrievalHints are sufficient, call retriever-${this.knowledgebaseId} using suggestedRetrievalQuery; ` +
                        `do not treat graph evidence quotes as the final answer.`
                })
            },
            {
                ...toolOptions,
                name: toolOptions?.name ?? `knowledge-graph-explorer-${this.knowledgebaseId}`,
                description:
                    toolOptions?.description ??
                    `Iteratively explore the GraphRAG index of knowledgebase '${knowledgebase.name}'. ` +
                        `Start with action='search', follow promising entity IDs with action='neighbors', inspect support with ` +
                        `action='evidence', then use the returned retrievalHints to call the knowledge Retriever for source chunks. ` +
                        `Every entity, relation, and evidence item is constrained by enabled content and administrator-managed ` +
                        `fixed filters. This tool is read-only and may be called multiple times.`,
                schema
            }
        )
    }

    private filterOptionsToolName() {
        return `knowledge-filter-options-${this.knowledgebaseId}`
    }

    private getToolKnowledgebase(): Promise<KnowledgebaseToolContext> {
        this.#toolKnowledgebase ??= this.queryBus.execute(
            new KnowledgebaseGetOneQuery({
                id: this.knowledgebaseId,
                options: {
                    select: {
                        id: true,
                        name: true,
                        description: true,
                        metadataSchema: true,
                        workspaceId: true,
                        tenantId: true,
                        organizationId: true,
                        graphRag: true,
                        graphStatus: true
                    }
                }
            })
        )
        return this.#toolKnowledgebase
    }
}

/**
 * Keep the provider-facing schema deliberately compact. Exact field/operator/type
 * validation belongs to KnowledgeFilterCompiler, where an invalid dynamic filter
 * can safely fall back to the fixed boundary and be audited as invalid_dynamic_filter.
 *
 * Some OpenAI-compatible providers serialize nested tool arguments as JSON text.
 * Accepting that transport form prevents LangChain from rejecting the whole tool
 * call before the knowledge-filter fallback policy can run.
 */
function createDynamicFilterToolInputSchema(fieldCatalog: string) {
    if (!fieldCatalog) return z.never().describe('No filter fields are available.')
    return z
        .union([z.record(z.any()), z.string().max(32_768)])
        .nullable()
        .describe('A KnowledgeFilterNode JSON object or its JSON-encoded string representation.')
}

function resolveKnowledgeFilterOptionKind(field: string, type: string) {
    if (field === 'document.folderPath') return 'folderTree'
    if (type === 'object') return 'existence'
    if (type.endsWith('[]')) return 'arrayValues'
    if (type === 'number' || type === 'datetime') return 'rangeValues'
    return 'values'
}

function allowsAgentGraphFilter(retrieval?: TKBRetrievalSettings) {
    return retrieval?.filtering?.agent?.enabled === true
}

export function normalizeDynamicFilterToolInput(value: unknown): KnowledgeFilterNode | undefined {
    if (value == null) return undefined
    let normalized = value
    for (let attempt = 0; attempt < 2 && typeof normalized === 'string'; attempt += 1) {
        try {
            normalized = JSON.parse(normalized)
        } catch {
            break
        }
    }
    return normalized as KnowledgeFilterNode
}

export function createKnowledgeRetriever(
    queryBus: QueryBus,
    knowledgebaseId: string,
    options?: {
        recall: TKBRecallParams
        retrieval?: TKBRetrievalSettings
    }
) {
    class DynamicKnowledgeRetriever extends KnowledgeRetriever {
        // To enable langchain to obtain the actual knowledgebaseId of the Retriever as the event name
        static lc_name(): string {
            return knowledgebaseId
        }
        constructor(
            queryBus: QueryBus,
            knowledgebaseId: string,
            options?: {
                recall: TKBRecallParams
                retrieval?: TKBRetrievalSettings
            }
        ) {
            super(queryBus, knowledgebaseId, options)
        }
    }
    return new DynamicKnowledgeRetriever(queryBus, knowledgebaseId, options) as KnowledgeRetriever
}
