import { ToolMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { Command, getCurrentTaskInput } from '@langchain/langgraph'
import {
    AiModelTypeEnum,
    ChatMessageEventTypeEnum,
    ChatMessageTypeEnum,
    ModelFeature,
    TAgentMiddlewareMeta,
    TAgentRunnableConfigurable
} from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import {
    AgentMiddleware,
    AgentMiddlewareStrategy,
    IAgentMiddlewareContext,
    IAgentMiddlewareStrategy,
    PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import { Subscriber } from 'rxjs'
import { z } from 'zod/v3'
import { XpertAuthoringService } from './xpert-authoring.service'
import {
    AssistantDraftMutationResult,
    AuthoringAssistantEffect,
    AuthoringAssistantRequestContext,
    AuthoringAssistantState,
    CopilotModelCatalogResult,
    CopilotModelCatalogSnapshot,
    EditXpertPayload,
    Icon,
    NewXpertPayload
} from './xpert-authoring.types'

const XPERT_AUTHORING_MIDDLEWARE_NAME = 'XpertAuthoringMiddleware'

const requestContextSchema = z
    .object({
        workspaceId: z.string().optional(),
        env: z.record(z.any()).optional(),
        targetXpertId: z.string().optional(),
        unsaved: z.boolean().optional(),
        baseDraftHash: z.string().optional()
    })
    .passthrough()

const stateSchema = z.object({
    xpertId: z.string().nullable().optional(),
    baseDraftHash: z.string().nullable().optional(),
    copilotModelCatalogTargetXpertId: z.string().nullable().optional(),
    copilotModelCatalogCurrentCopilotId: z.string().nullable().optional(),
    copilotModelCatalogCurrentProvider: z.string().nullable().optional(),
    copilotModelCatalogCurrentModelId: z.string().nullable().optional(),
    copilotModelCatalogAvailableModelIds: z.array(z.string()).nullable().optional(),
    copilotModelCatalogItems: z
        .array(
            z.object({
                copilotId: z.string(),
                provider: z.string().nullable(),
                modelType: z.nativeEnum(AiModelTypeEnum),
                model: z.string(),
                label: z.string().nullable(),
                features: z.array(z.nativeEnum(ModelFeature)).nullable().optional(),
                isCurrentProvider: z.boolean(),
                isCurrentModel: z.boolean()
            })
        )
        .nullable()
        .optional()
})

@Injectable()
@AgentMiddlewareStrategy(XPERT_AUTHORING_MIDDLEWARE_NAME)
export class XpertAuthoringMiddleware implements IAgentMiddlewareStrategy {
    meta: TAgentMiddlewareMeta = {
        name: XPERT_AUTHORING_MIDDLEWARE_NAME,
        label: {
            en_US: 'Xpert Authoring Middleware',
            zh_Hans: 'Xpert 编写中间件'
        },
        description: {
            en_US: 'Provides server-side authoring tools for platform ChatKit assistants.',
            zh_Hans: '为平台 ChatKit 助手提供服务端编写工具。'
        },
        icon: {
            type: 'svg',
            value: Icon,
            color: 'blue'
        },
        configSchema: {
            type: 'object',
            properties: {},
            required: []
        }
    }

    constructor(private readonly authoringService: XpertAuthoringService) {}

    createMiddleware(options: unknown, _context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
        void options
        void _context

        return {
            name: XPERT_AUTHORING_MIDDLEWARE_NAME,
            stateSchema,
            contextSchema: requestContextSchema,
            tools: this.createTools()
        }
    }

    private createTools() {
        return [
            this.createGetCurrentXpertTool(),
            this.createGetAvailableAgentMiddlewaresTool(),
            this.createGetAvailableCopilotModelsTool(),
            this.createGetAvailableToolsetsTool(),
            this.createGetAvailableKnowledgebasesTool(),
            this.createGetAvailableSkillsTool(),
            this.createNewXpertTool(),
            this.createEditXpertTool()
        ]
    }

    private createGetCurrentXpertTool() {
        return tool(
            async (_input, config) => {
                const runtimeState = this.readState()
                const context = this.resolveContext(this.readContext(config), runtimeState)
                const result = await this.authoringService.getCurrentXpertFromContext(context)
                return this.withCurrentXpertStateUpdate(result, runtimeState, config)
            },
            {
                name: 'getCurrentXpert',
                description: 'Get the current Xpert Studio draft as a YAML DSL string for inspection or editing.',
                schema: z.object({})
            }
        )
    }

    private createGetAvailableAgentMiddlewaresTool() {
        return tool(
            async (_input, config) => {
                const context = this.resolveContext(this.readContext(config), this.readState())
                return this.authoringService.getAvailableAgentMiddlewaresFromContext(context)
            },
            {
                name: 'getAvailableAgentMiddlewares',
                description: 'List the currently available agent middlewares for assistant context planning.',
                schema: z.object({})
            }
        )
    }

    private createGetAvailableCopilotModelsTool() {
        return tool(
            async (_input, config) => {
                const runtimeState = this.readState()
                const context = this.resolveContext(this.readContext(config), runtimeState)
                const result = await this.authoringService.getAvailableCopilotModelsFromContext(context)
                return this.withCopilotModelCatalogStateUpdate(result, runtimeState, context, config)
            },
            {
                name: 'getAvailableCopilotModels',
                description:
                    'List the available AI copilot models for the current Xpert, including LLM, embedding, rerank, speech-to-text, and text-to-speech models.',
                schema: z.object({})
            }
        )
    }

    private createGetAvailableToolsetsTool() {
        return tool(
            async (_input, config) => {
                const context = this.resolveContext(this.readContext(config), this.readState())
                return this.authoringService.getAvailableToolsetsFromContext(context)
            },
            {
                name: 'getAvailableToolsets',
                description: 'List the available toolsets in the current workspace for assistant context planning.',
                schema: z.object({})
            }
        )
    }

    private createGetAvailableKnowledgebasesTool() {
        return tool(
            async (_input, config) => {
                const context = this.resolveContext(this.readContext(config), this.readState())
                return this.authoringService.getAvailableKnowledgebasesFromContext(context)
            },
            {
                name: 'getAvailableKnowledgebases',
                description:
                    'List the available knowledgebases in the current workspace for assistant context planning.',
                schema: z.object({})
            }
        )
    }

    private createGetAvailableSkillsTool() {
        return tool(
            async (_input, config) => {
                const context = this.resolveContext(this.readContext(config), this.readState())
                return this.authoringService.getAvailableSkillsFromContext(context)
            },
            {
                name: 'getAvailableSkills',
                description: 'List the available skills in the current workspace for assistant context planning.',
                schema: z.object({})
            }
        )
    }

    private createNewXpertTool() {
        return tool(
            async (input, config) => {
                const runtimeState = this.readState()
                const context = this.resolveContext(this.readContext(config), runtimeState)
                const result = await this.authoringService.newXpertFromContext(context, input as NewXpertPayload)

                this.emitEffect(config?.configurable, result, {
                    name: 'navigate_to_studio',
                    data: {
                        xpertId: (result.updatedDraftFragment?.['team'] as { id?: string } | undefined)?.id ?? ''
                    }
                })

                return this.withAuthoringStateUpdate(result, runtimeState, config)
            },
            {
                name: 'newXpert',
                description: 'Create a new Xpert draft in the current workspace from the user request.',
                schema: z.object({
                    userIntent: z.string(),
                    templateId: z.string().optional(),
                    xpertName: z.string().optional()
                })
            }
        )
    }

    private createEditXpertTool() {
        return tool(
            async (input, config) => {
                const runtimeState = this.readState()
                const context = this.resolveContext(this.readContext(config), runtimeState)
                const result = await this.authoringService.editXpertFromContext(
                    context,
                    input as EditXpertPayload,
                    this.readCopilotModelCatalogSnapshot(runtimeState, context)
                )

                this.emitEffect(config?.configurable, result, {
                    name: 'refresh_studio',
                    data: {
                        xpertId: context.targetXpertId ?? ''
                    }
                })

                return this.withAuthoringStateUpdate(result, this.readState(), config)
            },
            {
                name: 'editXpert',
                description:
                    'Replace the current Xpert Studio draft with a full YAML DSL definition. If the draft sets or changes any AI model configuration, call getAvailableCopilotModels first and use only returned model ids.',
                schema: z.object({
                    dslYaml: z.string()
                })
            }
        )
    }

    private resolveContext(
        runtimeContext: unknown,
        runtimeState: AuthoringAssistantState | null = null
    ): AuthoringAssistantRequestContext {
        const parsed = requestContextSchema.parse(this.normalizeContext(runtimeContext, runtimeState))

        return parsed
    }

    private readState(): AuthoringAssistantState | null {
        try {
            const state = getCurrentTaskInput<Record<string, unknown>>()
            if (!state || typeof state !== 'object') {
                return {}
            }

            const xpertId = state['xpertId']
            const baseDraftHash = state['baseDraftHash']
            const copilotModelCatalogTargetXpertId = state['copilotModelCatalogTargetXpertId']
            const copilotModelCatalogCurrentCopilotId = state['copilotModelCatalogCurrentCopilotId']
            const copilotModelCatalogCurrentProvider = state['copilotModelCatalogCurrentProvider']
            const copilotModelCatalogCurrentModelId = state['copilotModelCatalogCurrentModelId']
            const copilotModelCatalogAvailableModelIds = state['copilotModelCatalogAvailableModelIds']
            const copilotModelCatalogItems = state['copilotModelCatalogItems']
            return {
                xpertId: typeof xpertId === 'string' ? xpertId : xpertId === null ? null : undefined,
                baseDraftHash:
                    typeof baseDraftHash === 'string' ? baseDraftHash : baseDraftHash === null ? null : undefined,
                copilotModelCatalogTargetXpertId:
                    typeof copilotModelCatalogTargetXpertId === 'string'
                        ? copilotModelCatalogTargetXpertId
                        : copilotModelCatalogTargetXpertId === null
                          ? null
                          : undefined,
                copilotModelCatalogCurrentCopilotId:
                    typeof copilotModelCatalogCurrentCopilotId === 'string'
                        ? copilotModelCatalogCurrentCopilotId
                        : copilotModelCatalogCurrentCopilotId === null
                          ? null
                          : undefined,
                copilotModelCatalogCurrentProvider:
                    typeof copilotModelCatalogCurrentProvider === 'string'
                        ? copilotModelCatalogCurrentProvider
                        : copilotModelCatalogCurrentProvider === null
                          ? null
                          : undefined,
                copilotModelCatalogCurrentModelId:
                    typeof copilotModelCatalogCurrentModelId === 'string'
                        ? copilotModelCatalogCurrentModelId
                        : copilotModelCatalogCurrentModelId === null
                          ? null
                          : undefined,
                copilotModelCatalogAvailableModelIds: Array.isArray(copilotModelCatalogAvailableModelIds)
                    ? copilotModelCatalogAvailableModelIds.filter(
                          (item): item is string => typeof item === 'string' && Boolean(item.trim())
                      )
                    : copilotModelCatalogAvailableModelIds === null
                      ? null
                      : undefined,
                copilotModelCatalogItems: Array.isArray(copilotModelCatalogItems)
                    ? copilotModelCatalogItems.filter(
                          (item): item is NonNullable<AuthoringAssistantState['copilotModelCatalogItems']>[number] =>
                              Boolean(item) &&
                              typeof item === 'object' &&
                              typeof item['copilotId'] === 'string' &&
                              Boolean(item['copilotId'].trim()) &&
                              typeof item['modelType'] === 'string' &&
                              typeof item['model'] === 'string' &&
                              Boolean(item['model'].trim()) &&
                              (typeof item['provider'] === 'string' || item['provider'] === null) &&
                              (typeof item['label'] === 'string' || item['label'] === null) &&
                              (Array.isArray(item['features']) || item['features'] == null) &&
                              typeof item['isCurrentProvider'] === 'boolean' &&
                              typeof item['isCurrentModel'] === 'boolean'
                      )
                    : copilotModelCatalogItems === null
                      ? null
                      : undefined
            }
        } catch {
            return null
        }
    }

    private readContext(config: unknown) {
        const runtimeConfig = config as
            | {
                  context?: Record<string, unknown> & {
                      env?: Record<string, unknown>
                  }
                  configurable?: {
                      context?: Record<string, unknown> & {
                          env?: Record<string, unknown>
                      }
                  }
              }
            | undefined

        const baseContext =
            runtimeConfig?.context && typeof runtimeConfig.context === 'object'
                ? { ...(runtimeConfig.context as Record<string, unknown>) }
                : runtimeConfig?.configurable?.context && typeof runtimeConfig.configurable.context === 'object'
                  ? { ...(runtimeConfig.configurable.context as Record<string, unknown>) }
                  : {}

        return baseContext
    }

    private normalizeContext(runtimeContext: unknown, runtimeState: AuthoringAssistantState | null = null) {
        if (!runtimeContext || typeof runtimeContext !== 'object') {
            return this.applyResolvedAuthoringState(runtimeContext ?? {}, runtimeState)
        }

        const context = { ...(runtimeContext as Record<string, unknown>) }
        for (const key of ['workspaceId', 'targetXpertId', 'baseDraftHash'] as const) {
            if (context[key] === null) {
                delete context[key]
            }
        }

        if (context['env'] == null) {
            delete context['env']
        } else if (typeof context['env'] === 'object' && !Array.isArray(context['env'])) {
            context['env'] = { ...(context['env'] as Record<string, unknown>) }
        } else {
            delete context['env']
        }

        return this.applyResolvedAuthoringState(context, runtimeState)
    }

    private applyResolvedAuthoringState(runtimeContext: unknown, runtimeState: AuthoringAssistantState | null) {
        if (!runtimeContext || typeof runtimeContext !== 'object') {
            return runtimeContext ?? {}
        }

        const context = { ...(runtimeContext as Record<string, unknown>) }
        const env =
            context['env'] && typeof context['env'] === 'object' && !Array.isArray(context['env'])
                ? (context['env'] as Record<string, unknown>)
                : null

        const stateXpertId =
            typeof runtimeState?.xpertId === 'string' && runtimeState.xpertId.trim()
                ? runtimeState.xpertId.trim()
                : null
        const explicitTargetXpertId =
            typeof context['targetXpertId'] === 'string' && context['targetXpertId'].trim()
                ? (context['targetXpertId'] as string).trim()
                : null
        const topLevelXpertId =
            typeof context['xpertId'] === 'string' && context['xpertId'].trim()
                ? (context['xpertId'] as string).trim()
                : null
        const envXpertId =
            typeof env?.['xpertId'] === 'string' && env['xpertId'].trim() ? (env['xpertId'] as string).trim() : null

        const resolvedXpertId = explicitTargetXpertId ?? topLevelXpertId ?? stateXpertId ?? envXpertId
        if (resolvedXpertId) {
            context['targetXpertId'] = resolvedXpertId
        } else {
            delete context['targetXpertId']
        }

        const stateBaseDraftHash =
            typeof runtimeState?.baseDraftHash === 'string' && runtimeState.baseDraftHash.trim()
                ? runtimeState.baseDraftHash.trim()
                : null
        const explicitBaseDraftHash =
            typeof context['baseDraftHash'] === 'string' && context['baseDraftHash'].trim()
                ? (context['baseDraftHash'] as string).trim()
                : null
        const resolvedBaseDraftHash = stateBaseDraftHash ?? explicitBaseDraftHash
        if (resolvedBaseDraftHash) {
            context['baseDraftHash'] = resolvedBaseDraftHash
        } else {
            delete context['baseDraftHash']
        }

        return context
    }

    private withCurrentXpertStateUpdate(
        result: {
            xpertId: string | null
            committedDraftHash?: string | null
        },
        runtimeState: AuthoringAssistantState | null,
        config: unknown
    ) {
        const toolCallId = this.readToolCallId(config)
        const xpertId = typeof result.xpertId === 'string' && result.xpertId.trim() ? result.xpertId : null
        const baseDraftHash =
            typeof result.committedDraftHash === 'string' && result.committedDraftHash.trim()
                ? result.committedDraftHash
                : null

        if (runtimeState === null || !toolCallId || (!xpertId && !baseDraftHash)) {
            return result
        }

        return new Command({
            update: {
                ...(xpertId ? { xpertId } : {}),
                ...(baseDraftHash ? { baseDraftHash } : {}),
                messages: [
                    new ToolMessage({
                        name: 'getCurrentXpert',
                        content: JSON.stringify(result),
                        tool_call_id: toolCallId
                    })
                ]
            }
        })
    }

    private withCopilotModelCatalogStateUpdate(
        result: CopilotModelCatalogResult,
        runtimeState: AuthoringAssistantState | null,
        context: AuthoringAssistantRequestContext,
        config: unknown
    ) {
        const toolCallId = this.readToolCallId(config)
        if (runtimeState === null || !toolCallId) {
            return result
        }

        return new Command({
            update: {
                copilotModelCatalogTargetXpertId: context.targetXpertId ?? null,
                copilotModelCatalogCurrentCopilotId: result.currentCopilotId ?? null,
                copilotModelCatalogCurrentProvider: result.currentProvider ?? null,
                copilotModelCatalogCurrentModelId: result.currentModelId ?? null,
                copilotModelCatalogAvailableModelIds: result.items.map((item) => item.model),
                copilotModelCatalogItems: result.items,
                messages: [
                    new ToolMessage({
                        name: 'getAvailableCopilotModels',
                        content: JSON.stringify(result),
                        tool_call_id: toolCallId
                    })
                ]
            }
        })
    }

    private withAuthoringStateUpdate(
        result: AssistantDraftMutationResult,
        runtimeState: AuthoringAssistantState | null,
        config: unknown
    ) {
        const xpertId = (result.updatedDraftFragment?.['team'] as { id?: string } | undefined)?.id
        const baseDraftHash =
            typeof result.committedDraftHash === 'string' && result.committedDraftHash.trim()
                ? result.committedDraftHash
                : null
        if (
            runtimeState === null ||
            result.status !== 'applied' ||
            (result.toolName !== 'newXpert' && result.toolName !== 'editXpert') ||
            (!xpertId && !baseDraftHash)
        ) {
            return result
        }

        return new Command({
            update: {
                ...(xpertId ? { xpertId } : {}),
                ...(baseDraftHash ? { baseDraftHash } : {}),
                ...(result.toolName === 'editXpert'
                    ? {
                          copilotModelCatalogTargetXpertId: null,
                          copilotModelCatalogCurrentCopilotId: null,
                          copilotModelCatalogCurrentProvider: null,
                          copilotModelCatalogCurrentModelId: null,
                          copilotModelCatalogAvailableModelIds: null,
                          copilotModelCatalogItems: null
                      }
                    : {}),
                messages: [
                    new ToolMessage({
                        name: result.toolName,
                        content: JSON.stringify(result),
                        tool_call_id: this.readToolCallId(config) ?? ''
                    })
                ]
            }
        })
    }

    private readToolCallId(config: unknown) {
        const runtimeConfig = config as
            | {
                  metadata?: {
                      tool_call_id?: string
                  }
              }
            | undefined

        return runtimeConfig?.metadata?.tool_call_id
    }

    private readCopilotModelCatalogSnapshot(
        runtimeState: AuthoringAssistantState | null,
        context: AuthoringAssistantRequestContext
    ): CopilotModelCatalogSnapshot | null {
        const availableModelIds = runtimeState?.copilotModelCatalogAvailableModelIds
        if (!Array.isArray(availableModelIds)) {
            return null
        }

        const catalogTargetXpertId =
            typeof runtimeState?.copilotModelCatalogTargetXpertId === 'string'
                ? runtimeState.copilotModelCatalogTargetXpertId
                : runtimeState?.copilotModelCatalogTargetXpertId === null
                  ? null
                  : null

        if (context.targetXpertId && catalogTargetXpertId !== context.targetXpertId) {
            return null
        }

        return {
            targetXpertId: catalogTargetXpertId,
            currentCopilotId:
                typeof runtimeState?.copilotModelCatalogCurrentCopilotId === 'string'
                    ? runtimeState.copilotModelCatalogCurrentCopilotId
                    : runtimeState?.copilotModelCatalogCurrentCopilotId === null
                      ? null
                      : null,
            currentProvider: runtimeState?.copilotModelCatalogCurrentProvider ?? null,
            currentModelId: runtimeState?.copilotModelCatalogCurrentModelId ?? null,
            availableModelIds,
            items: Array.isArray(runtimeState?.copilotModelCatalogItems) ? runtimeState.copilotModelCatalogItems : null
        }
    }

    private emitEffect(configurable: unknown, result: AssistantDraftMutationResult, effect: AuthoringAssistantEffect) {
        if (result.status !== 'applied') {
            return
        }

        const runtimeConfig = configurable as
            | (TAgentRunnableConfigurable & {
                  subscriber?: Subscriber<MessageEvent>
                  xpertName?: string
              })
            | undefined

        if (!effect.data?.xpertId) {
            return
        }

        runtimeConfig?.subscriber?.next({
            data: {
                type: ChatMessageTypeEnum.EVENT,
                event: ChatMessageEventTypeEnum.ON_CLIENT_EFFECT,
                data: {
                    name: effect.name,
                    args: effect.data,
                    tool_call_id: runtimeConfig?.tool_call_id,
                    executionId: runtimeConfig?.executionId,
                    agentKey: runtimeConfig?.agentKey,
                    xpertName: runtimeConfig?.xpertName,
                    created_date: new Date()
                }
            }
        } as MessageEvent)
    }
}
