import {
    IXpert,
    IWFNMiddleware,
    PluginMeta,
    STATE_VARIABLE_HUMAN,
    TAgentMiddlewareSource,
    TChatOptions,
    TChatRequest,
    TXpertAgentChatRequest,
    isUserAddableAgentMiddleware,
    normalizeMiddlewareOptions,
    WorkflowNodeTypeEnum
} from '@xpert-ai/contracts'
import {
    LOADED_PLUGINS,
    LoadedPluginRecord,
    normalizePluginName,
    TenantOrganizationAwareCrudService
} from '@xpert-ai/server-core'
import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { AgentMiddlewareRegistry, type IAgentMiddlewareStrategy, RequestContext } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { assign } from 'lodash'
import { Repository } from 'typeorm'
import { ToolSchemaParser } from '../shared/tools/utils'
import { AgentMiddlewareRuntimeService } from '../shared/agent/middleware-runtime/index'
import { resolveXpertDataVolumeScope } from '../shared/volume'
import { FindXpertQuery } from '../xpert/queries'
import { XpertService } from '../xpert/xpert.service'
import { AssertChatConversationAccessQuery } from '../chat-conversation/queries/conversation-assert-access.query'
import { AssertXpertAgentExecutionAccessQuery } from '../xpert-agent-execution/queries/assert-access.query'
import { XpertChatCommand } from '../xpert/commands/chat.command'
import { XpertAgent } from './xpert-agent.entity'

@Injectable()
export class XpertAgentService extends TenantOrganizationAwareCrudService<XpertAgent> {
    readonly #logger = new Logger(XpertAgentService.name)

    @Inject(AgentMiddlewareRegistry)
    private readonly agentMiddlewareRegistry: AgentMiddlewareRegistry

    constructor(
        @InjectRepository(XpertAgent)
        repository: Repository<XpertAgent>,
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
        private readonly agentMiddlewareRuntimeService: AgentMiddlewareRuntimeService,
        private readonly xpertService: XpertService,
        @Optional()
        @Inject(LOADED_PLUGINS)
        private readonly loadedPlugins: LoadedPluginRecord[] = []
    ) {
        super(repository)
    }

    async update(id: string, entity: Partial<XpertAgent>) {
        const _entity = await super.findOne(id)
        assign(_entity, entity)
        return await this.repository.save(_entity)
    }

    async chatAgent(request: TXpertAgentChatRequest, options: TChatOptions) {
        const { xpertId, agentKey } = request
        if (!agentKey?.trim()) {
            throw new BadRequestException(t('server-ai:Error.AgentInvocationInvalidRequest'))
        }
        await this.xpertService.assertCanAuthorById(xpertId)

        // Use the conversation run lifecycle so the selected draft agent has a real thread and checkpoint.
        let chat: TChatRequest
        if (request.action === 'resume' || (request.action === 'follow_up' && request.target?.executionId)) {
            const executionId = request.target?.executionId
            if (!executionId) {
                throw new BadRequestException(t('server-ai:Error.AgentInvocationInvalidRequest'))
            }
            const execution = await this.queryBus.execute(
                new AssertXpertAgentExecutionAccessQuery(executionId, 'contribute')
            )
            if (
                !execution.threadId ||
                execution.xpertId !== xpertId ||
                execution.agentKey !== agentKey ||
                execution.parentId
            ) {
                throw new ForbiddenException(t('server-ai:Error.ExecutionAccessDenied'))
            }
            const conversation = await this.queryBus.execute(
                new AssertChatConversationAccessQuery(
                    { threadId: execution.threadId, xpertId, from: 'debugger' },
                    'contribute'
                )
            )
            const continuation = { conversationId: conversation.id, target: { executionId }, state: request.state }
            chat =
                request.action === 'resume'
                    ? { ...continuation, action: 'resume', decision: request.decision, patch: request.patch }
                    : { ...continuation, action: 'follow_up', mode: request.mode, message: request.message }
        } else {
            chat = {
                action: 'send',
                state: request.state,
                message:
                    request.action === 'follow_up'
                        ? request.message
                        : { input: request.state?.[STATE_VARIABLE_HUMAN] ?? {} }
            }
        }
        return this.commandBus.execute(
            new XpertChatCommand(chat, { ...options, xpertId, agentKey, isDraft: true, from: 'debugger' })
        )
    }

    getMiddlewareStrategies() {
        return this.agentMiddlewareRegistry
            .list()
            .filter((strategy) => isUserAddableAgentMiddleware(strategy.meta))
            .map((strategy) => {
                return {
                    meta: strategy.meta,
                    source: this.resolveMiddlewareSource(strategy)
                }
            })
    }

    private resolveMiddlewareSource(strategy: IAgentMiddlewareStrategy): TAgentMiddlewareSource {
        const source = this.agentMiddlewareRegistry.getSource(strategy)
        if (source.kind === 'builtin') {
            return { kind: 'builtin' }
        }

        const plugin = [...this.loadedPlugins]
            .reverse()
            .find(
                (candidate) =>
                    (candidate.scopeKey ?? candidate.organizationId) === source.scopeKey &&
                    normalizePluginName(candidate.packageName ?? candidate.name) === source.pluginName
            )
        const pluginMeta: PluginMeta | undefined = plugin?.instance?.meta

        return {
            kind: 'plugin',
            pluginName: source.pluginName,
            displayName: pluginMeta?.displayName ?? source.pluginName,
            ...(pluginMeta?.icon ? { icon: pluginMeta.icon } : {})
        }
    }

    private createMiddlewareNode(provider: string, options: any): IWFNMiddleware {
        return {
            id: null,
            key: null,
            type: WorkflowNodeTypeEnum.MIDDLEWARE,
            provider,
            options
        }
    }

    private normalizeSchema(schema: any) {
        if (!schema) {
            return null
        }
        try {
            if ((schema as any)?._def) {
                return ToolSchemaParser.parseZodToJsonSchema(schema)
            }
            return JSON.parse(JSON.stringify(schema))
        } catch {
            return null
        }
    }

    private async getDraftXpertMiddlewareContext(xpertId?: string) {
        if (!xpertId) {
            return {
                xpertId: undefined,
                xpertFeatures: null,
                workspaceId: undefined,
                workspaceDataScope: undefined
            }
        }

        await this.xpertService.assertCanAuthorById(xpertId)
        const xpert = await this.queryBus.execute<
            FindXpertQuery,
            Pick<IXpert, 'id' | 'features' | 'workspaceId' | 'workspaceDataScope'> | null
        >(new FindXpertQuery({ id: xpertId }, { isDraft: true }))

        return {
            xpertId: xpert?.id,
            xpertFeatures: xpert?.features ?? null,
            workspaceId: xpert?.workspaceId,
            workspaceDataScope: xpert?.workspaceDataScope
        }
    }

    private createDraftXpertMiddlewareRuntime(
        draftContext: Awaited<ReturnType<typeof this.getDraftXpertMiddlewareContext>>
    ) {
        const tenantId = RequestContext.currentTenantId()
        const userId = RequestContext.currentUserId()
        const xpertScope = draftContext.xpertId
            ? resolveXpertDataVolumeScope({
                  tenantId,
                  userId,
                  xpertId: draftContext.xpertId,
                  workspaceDataScope: draftContext.workspaceDataScope
              })
            : null
        return this.agentMiddlewareRuntimeService.createScopedApi({
            tenantId,
            organizationId: RequestContext.getOrganizationId(),
            userId,
            workspaceId: draftContext.workspaceId,
            ...(xpertScope
                ? {
                      ...xpertScope,
                      scopeId: xpertScope.xpertId,
                      isolateByUser: xpertScope.catalog === 'user-xperts'
                  }
                : {})
        })
    }

    async getMiddlewareTools(provider: string, body: { xpertId?: string; options?: any }) {
        const strategy = this.agentMiddlewareRegistry.get(provider)
        const draftContext = await this.getDraftXpertMiddlewareContext(body?.xpertId)
        const runtime = this.createDraftXpertMiddlewareRuntime(draftContext)
        const options = normalizeMiddlewareOptions(body?.options)
        const middleware = await strategy.createMiddleware(options, {
            tenantId: RequestContext.currentTenantId(),
            organizationId: RequestContext.getOrganizationId(),
            userId: RequestContext.currentUserId(),
            xpertId: draftContext.xpertId,
            workspaceId: draftContext.workspaceId,
            workspaceDataScope: draftContext.workspaceDataScope,
            xpertFeatures: draftContext.xpertFeatures,
            node: this.createMiddlewareNode(provider, options),
            tools: new Map(),
            runtime
        })
        return {
            stateSchema: this.normalizeSchema(middleware.stateSchema),
            tools:
                middleware.tools?.map((tool) => ({
                    name: tool.name,
                    description: tool.description,
                    schema: this.normalizeSchema(tool.schema)
                })) ?? []
        }
    }

    async testMiddlewareTool(
        provider: string,
        toolName: string,
        body: { xpertId?: string; options?: any; parameters?: Record<string, any> }
    ) {
        const strategy = this.agentMiddlewareRegistry.get(provider)
        const draftContext = await this.getDraftXpertMiddlewareContext(body?.xpertId)
        const runtime = this.createDraftXpertMiddlewareRuntime(draftContext)
        const options = normalizeMiddlewareOptions(body?.options)
        const middleware = await strategy.createMiddleware(options, {
            tenantId: RequestContext.currentTenantId(),
            organizationId: RequestContext.getOrganizationId(),
            userId: RequestContext.currentUserId(),
            xpertId: draftContext.xpertId,
            workspaceId: draftContext.workspaceId,
            workspaceDataScope: draftContext.workspaceDataScope,
            xpertFeatures: draftContext.xpertFeatures,
            node: this.createMiddlewareNode(provider, options),
            tools: new Map(),
            runtime
        })
        const tool = middleware?.tools?.find((tool) => tool.name === toolName)
        if (!tool) {
            throw new Error(`Middleware tool '${toolName}' not found in provider '${provider}'`)
        }
        return await tool.invoke(body?.parameters ?? {})
    }
}
