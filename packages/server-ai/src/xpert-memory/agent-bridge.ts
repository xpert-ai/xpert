import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { IXpertAgent, LongTermMemoryTypeEnum, MemoryAudienceEnum, MemoryScopeTypeEnum } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { Injectable, Logger } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { GetXpertChatModelQuery } from '../xpert/queries'
import { MemoryAgentBridge, MemoryDirectReplyResult, MemoryAudience, MemoryRuntimeRecallResult } from './types'
import { MemoryRegistry } from './registry'

@Injectable()
export class XpertMemoryAgentBridgeService {
    readonly #logger = new Logger(XpertMemoryAgentBridgeService.name)

    constructor(
        private readonly queryBus: QueryBus,
        private readonly memoryRegistry: MemoryRegistry
    ) {}

    createRuntimeBridge(params: {
        tenantId: string
        userId: string
        xpert: {
            id: string
            workspaceId?: string | null
            features?: { memoryReply?: { enabled?: boolean; scoreThreshold?: number } | null } | null
        }
        agent: IXpertAgent
        providerName: string
        threadId?: string
        abortController?: AbortController | null
    }): MemoryAgentBridge {
        const memoryProvider = this.memoryRegistry.getProvider(params.providerName)
        const scope = memoryProvider?.resolveScope(params.xpert) ?? {
            scopeType: MemoryScopeTypeEnum.XPERT,
            scopeId: params.xpert.id
        }
        const available = !!memoryProvider
        const memoryReply = params.xpert.features?.memoryReply

        if (!memoryProvider) {
            this.#logger.warn(
                `File memory middleware is active, but memory provider "${params.providerName}" is not registered. Falling back to noop memory bridge.`
            )
        }

        return {
            enabled: available,
            prepareRecall: async ({ query, recentTools, alreadySurfaced, surfacedBytes }) => {
                if (!available || !memoryProvider) {
                    return emptyRecall(scope)
                }

                const chatModel = await this.getRecallModel(params.agent, {
                    threadId: params.threadId,
                    abortController: params.abortController ?? undefined
                })

                return memoryProvider.buildRuntimeRecall(params.tenantId, scope, {
                    query,
                    userId: params.userId,
                    chatModel,
                    recentTools,
                    alreadySurfaced: new Set(alreadySurfaced ?? []),
                    surfacedBytes
                })
            },
            search: async ({ query, limit }) => {
                if (!available || !memoryProvider) {
                    return []
                }
                return memoryProvider.search(params.tenantId, scope, {
                    userId: params.userId,
                    audience: 'all',
                    text: query,
                    includeArchived: false,
                    includeFrozen: false,
                    limit: limit ?? 5
                })
            },
            reply: async ({ query }): Promise<MemoryDirectReplyResult | null> => {
                if (!available || !memoryProvider || !memoryReply?.enabled) {
                    return null
                }
                const items = await memoryProvider.search(params.tenantId, scope, {
                    kinds: [LongTermMemoryTypeEnum.QA],
                    userId: params.userId,
                    audience: 'all',
                    text: query,
                    includeArchived: false,
                    includeFrozen: false,
                    limit: 3
                })
                const match = items.find((item) => item.score >= (memoryReply.scoreThreshold ?? 0.8))
                if (!match) {
                    return null
                }
                return {
                    content:
                        match.kind === LongTermMemoryTypeEnum.QA && 'answer' in match.value
                            ? match.value.answer
                            : match.content,
                    record: match
                }
            },
            write: async ({ type, audience, memoryId, title, content, context, tags }) => {
                if (!memoryProvider) {
                    throw new Error(`File memory provider "${params.providerName}" is unavailable.`)
                }
                return memoryProvider.upsert(params.tenantId, {
                    scope,
                    audience: audience ?? undefined,
                    ownerUserId: audience === MemoryAudienceEnum.USER ? params.userId : undefined,
                    kind: type,
                    memoryId: memoryId ?? undefined,
                    title,
                    content,
                    context: context ?? undefined,
                    tags: tags ?? undefined,
                    source: 'tool',
                    createdBy: params.userId
                })
            }
        }
    }

    private async getRecallModel(
        agent: IXpertAgent,
        options: {
            threadId?: string
            abortController?: AbortController
        }
    ): Promise<BaseChatModel | null> {
        try {
            return await this.queryBus.execute<GetXpertChatModelQuery, BaseChatModel>(
                new GetXpertChatModelQuery(agent.team, agent, {
                    abortController: options.abortController,
                    usageCallback: () => void 0,
                    threadId: options.threadId
                })
            )
        } catch (error) {
            this.#logger.warn(`Prepare file-memory recall model failed: ${getErrorMessage(error)}`)
            return null
        }
    }
}

function emptyRecall(scope: { scopeType: string; scopeId: string }): MemoryRuntimeRecallResult {
    return {
        layers: [],
        index: '',
        headers: [],
        selected: [],
        entrypoints: [],
        details: [],
        surfaceState: {
            alreadySurfaced: [],
            totalBytes: 0
        },
        budget: {
            maxSelectedTotal: 5,
            maxSelectedUser: 3,
            maxSelectedShared: 2,
            maxFilesPerLayer: 200,
            maxHeaderLines: 30,
            maxMemoryLinesPerFile: 200,
            maxMemoryBytesPerFile: 4096,
            maxRecallBytesPerTurn: 20 * 1024,
            maxRecallBytesPerSession: 60 * 1024
        }
    }
}
