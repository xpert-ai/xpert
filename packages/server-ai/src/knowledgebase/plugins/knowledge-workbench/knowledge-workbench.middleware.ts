import { tool } from '@langchain/core/tools'
import { getToolCallIdFromConfig, TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { BadRequestException, Injectable } from '@nestjs/common'
import {
    AgentMiddleware,
    AgentMiddlewareStrategy,
    IAgentMiddlewareContext,
    IAgentMiddlewareStrategy
} from '@xpert-ai/plugin-sdk'
import {
    KNOWLEDGE_WORKBENCH_FEATURE,
    KNOWLEDGE_WORKBENCH_ICON,
    KNOWLEDGE_WORKBENCH_LIST_DOCUMENTS_TOOL,
    KNOWLEDGE_WORKBENCH_OPEN_TOOL,
    KNOWLEDGE_WORKBENCH_PREVIEW_DOCUMENT_TOOL,
    KNOWLEDGE_WORKBENCH_PROVIDER_KEY,
    KNOWLEDGE_WORKBENCH_SEARCH_TOOL,
    KNOWLEDGE_WORKBENCH_VIEW_KEY,
    XPERT_VISUALIZATION_META_KEY
} from './constants'
import { KnowledgeWorkbenchService } from './knowledge-workbench.service'
import {
    knowledgeWorkbenchRequestContextSchema,
    listKnowledgeWorkbenchDocumentsSchema,
    openKnowledgeWorkbenchSchema,
    previewKnowledgeWorkbenchDocumentSchema,
    searchKnowledgeWorkbenchSchema
} from './schemas'

type RuntimeContext = {
    knowledgebase_workbench?: {
        knowledgebaseId?: string
        documentIds?: string[]
        documents?: Array<{
            id: string
            name?: string
            path?: string
        }>
    }
}

@Injectable()
@AgentMiddlewareStrategy(KNOWLEDGE_WORKBENCH_PROVIDER_KEY)
export class KnowledgeWorkbenchMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
    readonly meta: TAgentMiddlewareMeta = {
        name: KNOWLEDGE_WORKBENCH_PROVIDER_KEY,
        label: {
            en_US: 'Knowledgebase Workbench',
            zh_Hans: '知识库 Workbench'
        },
        description: {
            en_US: 'Adds an interactive knowledgebase document workbench and citation-aware retrieval tools for the current assistant.',
            zh_Hans: '为当前 Assistant 提供知识库文档浏览、预览、上传和带来源引用的定向检索工具。'
        },
        icon: {
            type: 'svg',
            value: KNOWLEDGE_WORKBENCH_ICON,
            color: '#14b8a6'
        },
        features: [KNOWLEDGE_WORKBENCH_FEATURE],
        configSchema: {
            type: 'object',
            properties: {},
            required: []
        }
    }

    constructor(private readonly workbenchService: KnowledgeWorkbenchService) {}

    async createMiddleware(
        _options: Record<string, never>,
        context: IAgentMiddlewareContext
    ): Promise<AgentMiddleware> {
        return {
            name: KNOWLEDGE_WORKBENCH_PROVIDER_KEY,
            contextSchema: knowledgeWorkbenchRequestContextSchema,
            tools: [
                this.createOpenTool(context),
                this.createSearchTool(context),
                this.createListDocumentsTool(context),
                this.createPreviewDocumentTool(context)
            ]
        }
    }

    private createOpenTool(context: IAgentMiddlewareContext) {
        return tool(
            async (input, config) => {
                const runtimeContext = readWorkbenchRuntimeContext(config)
                const knowledgebaseId = input.knowledgebaseId ?? runtimeContext.knowledgebase_workbench?.knowledgebaseId
                const resolvedKnowledgebaseId = this.resolveKnowledgebaseId(context, knowledgebaseId)
                const stableKey = [
                    resolvedKnowledgebaseId,
                    input.documentId,
                    input.chunkId,
                    input.search,
                    getToolCallIdFromConfig(config)
                ]
                    .filter(Boolean)
                    .join(':')

                return JSON.stringify({
                    message: 'Knowledgebase workbench view is ready.',
                    knowledgebaseId: resolvedKnowledgebaseId,
                    documentId: input.documentId,
                    chunkId: input.chunkId,
                    _meta: {
                        [XPERT_VISUALIZATION_META_KEY]: {
                            type: 'xpert.extension_view',
                            title: '知识库 Workbench',
                            slotKey: 'knowledgebase-workbench',
                            parameterKey: `knowledge-workbench:${stableKey || 'default'}`,
                            renderMode: 'replace',
                            payload: {
                                version: 1,
                                viewKey: KNOWLEDGE_WORKBENCH_VIEW_KEY,
                                parameters: compactRecord({
                                    knowledgebaseId: resolvedKnowledgebaseId,
                                    documentId: input.documentId,
                                    chunkId: input.chunkId
                                }),
                                initialQuery: {
                                    page: 1,
                                    pageSize: 20,
                                    ...(input.search ? { search: input.search } : {})
                                }
                            },
                            metadata: {
                                source: 'agent-middleware',
                                sourceId: KNOWLEDGE_WORKBENCH_OPEN_TOOL
                            }
                        }
                    }
                })
            },
            {
                name: KNOWLEDGE_WORKBENCH_OPEN_TOOL,
                description:
                    'Open the knowledgebase workbench view. Use this when users ask to browse, preview, upload, select, or inspect source documents.',
                schema: openKnowledgeWorkbenchSchema
            }
        )
    }

    private createSearchTool(context: IAgentMiddlewareContext) {
        return tool(
            async (input, config) => {
                const runtimeContext = readWorkbenchRuntimeContext(config)
                const selected = runtimeContext.knowledgebase_workbench
                const knowledgebaseId = input.knowledgebaseId ?? selected?.knowledgebaseId
                const documentIds = input.documentIds?.length ? input.documentIds : selected?.documentIds

                const result = await this.workbenchService.searchDocuments({
                    tenantId: context.tenantId,
                    organizationId: context.organizationId,
                    allowedKnowledgebaseIds: context.knowledgebaseIds ?? [],
                    query: input.query,
                    knowledgebaseId,
                    documentIds,
                    topK: input.topK
                })

                return JSON.stringify({
                    ...result,
                    selectedDocuments: selected?.documents ?? [],
                    _meta: {
                        knowledgebaseWorkbench: {
                            viewKey: KNOWLEDGE_WORKBENCH_VIEW_KEY,
                            knowledgebaseId: result.knowledgebaseId,
                            documentIds: result.documentIds,
                            citations: result.citations.map((citation) => ({
                                chunkId: citation.chunkId,
                                documentId: citation.documentId,
                                documentName: citation.documentName,
                                citationUrl: citation.citationUrl
                            }))
                        }
                    }
                })
            },
            {
                name: KNOWLEDGE_WORKBENCH_SEARCH_TOOL,
                description:
                    'Search the knowledgebases connected to this assistant and return source-aware chunks. Defaults to the documents selected in the Knowledgebase Workbench context. When a chunk is used to support an answer, append its citationMarkdown immediately after the supported sentence or paragraph.',
                schema: searchKnowledgeWorkbenchSchema
            }
        )
    }

    private createListDocumentsTool(context: IAgentMiddlewareContext) {
        return tool(
            async (input, config) => {
                const runtimeContext = readWorkbenchRuntimeContext(config)
                const selected = runtimeContext.knowledgebase_workbench
                const knowledgebaseId = input.knowledgebaseId ?? selected?.knowledgebaseId
                const result = await this.workbenchService.listDocuments({
                    allowedKnowledgebaseIds: context.knowledgebaseIds ?? [],
                    knowledgebaseId,
                    parentId: input.parentId,
                    search: input.search,
                    page: input.page,
                    pageSize: input.pageSize
                })
                return JSON.stringify({
                    knowledgebaseId: this.resolveKnowledgebaseId(context, knowledgebaseId),
                    ...result
                })
            },
            {
                name: KNOWLEDGE_WORKBENCH_LIST_DOCUMENTS_TOOL,
                description:
                    'List folders and documents in a connected knowledgebase. Use it to answer questions about available files before targeted retrieval.',
                schema: listKnowledgeWorkbenchDocumentsSchema
            }
        )
    }

    private createPreviewDocumentTool(context: IAgentMiddlewareContext) {
        return tool(
            async (input) => {
                const preview = await this.workbenchService.getDocumentPreview(
                    input.documentId,
                    context.knowledgebaseIds ?? []
                )
                return JSON.stringify({
                    ...preview,
                    _meta: {
                        knowledgebaseWorkbench: {
                            viewKey: KNOWLEDGE_WORKBENCH_VIEW_KEY,
                            knowledgebaseId: preview.document.knowledgebaseId,
                            documentId: preview.document.id
                        }
                    }
                })
            },
            {
                name: KNOWLEDGE_WORKBENCH_PREVIEW_DOCUMENT_TOOL,
                description:
                    'Preview a connected knowledgebase document and return its original file information and parsed chunks.',
                schema: previewKnowledgeWorkbenchDocumentSchema
            }
        )
    }

    private resolveKnowledgebaseId(context: IAgentMiddlewareContext, knowledgebaseId?: string) {
        const knowledgebaseIds = context.knowledgebaseIds ?? []
        const resolved = this.workbenchService.resolveKnowledgebaseId(knowledgebaseId, knowledgebaseIds)
        if (!resolved) {
            throw new BadRequestException('The selected knowledgebase is not connected to the current agent')
        }
        return resolved
    }
}

function readWorkbenchRuntimeContext(config: unknown): RuntimeContext {
    const runtimeConfig = config as
        | {
              context?: Record<string, unknown>
              configurable?: {
                  context?: Record<string, unknown>
              }
          }
        | undefined

    const context =
        runtimeConfig?.context && typeof runtimeConfig.context === 'object'
            ? runtimeConfig.context
            : runtimeConfig?.configurable?.context && typeof runtimeConfig.configurable.context === 'object'
              ? runtimeConfig.configurable.context
              : {}

    const parsed = knowledgeWorkbenchRequestContextSchema.safeParse(context)
    if (!parsed.success) {
        return {}
    }
    return parsed.data as RuntimeContext
}

function compactRecord(input: Record<string, string | undefined>) {
    const result: Record<string, string> = {}
    for (const [key, value] of Object.entries(input)) {
        if (value?.trim()) {
            result[key] = value.trim()
        }
    }
    return result
}
