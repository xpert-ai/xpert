import {
    IXpert,
    IWFNMiddleware,
    PluginMeta,
    STATE_VARIABLE_HUMAN,
    TAgentMiddlewareSource,
    TChatOptions,
    TXpertAgentChatRequest,
    isUserAddableAgentMiddleware,
    WorkflowNodeTypeEnum
} from '@xpert-ai/contracts'
import {
    LOADED_PLUGINS,
    LoadedPluginRecord,
    normalizePluginName,
    TenantOrganizationAwareCrudService
} from '@xpert-ai/server-core'
import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { AgentMiddlewareRegistry, type IAgentMiddlewareStrategy, RequestContext } from '@xpert-ai/plugin-sdk'
import { assign } from 'lodash'
import { Observable } from 'rxjs'
import { Repository } from 'typeorm'
import { ToolSchemaParser } from '../shared/tools/utils'
import { AgentMiddlewareRuntimeService } from '../shared/agent/middleware-runtime.service'
import { resolveXpertDataVolumeScope } from '../shared/volume'
import { FindXpertQuery } from '../xpert/queries'
import { XpertService } from '../xpert/xpert.service'
import { XpertAgentChatCommand } from './commands'
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

    async chatAgent(params: TXpertAgentChatRequest, options: TChatOptions) {
        const request = params
        const xpertId = request.xpertId
        const xpert = await this.queryBus.execute(
            new FindXpertQuery({ id: xpertId }, { relations: ['agent'], isDraft: true })
        )
        return await this.commandBus.execute<XpertAgentChatCommand, Observable<MessageEvent>>(
            new XpertAgentChatCommand(request.state ?? { [STATE_VARIABLE_HUMAN]: {} as any }, request.agentKey, xpert, {
                ...options,
                isDraft: true,
                store: null,
                execution:
                    request.action === 'resume'
                        ? {
                              id: request.target.executionId,
                              category: 'agent'
                          }
                        : undefined,
                resume:
                    request.action === 'resume'
                        ? {
                              decision: request.decision,
                              ...(request.patch ? { patch: request.patch } : {})
                          }
                        : undefined,
                from: 'debugger'
            })
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
        const middleware = await strategy.createMiddleware(body?.options, {
            tenantId: RequestContext.currentTenantId(),
            userId: RequestContext.currentUserId(),
            xpertId: draftContext.xpertId,
            workspaceId: draftContext.workspaceId,
            workspaceDataScope: draftContext.workspaceDataScope,
            xpertFeatures: draftContext.xpertFeatures,
            node: this.createMiddlewareNode(provider, body?.options),
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
        const middleware = await strategy.createMiddleware(body?.options, {
            tenantId: RequestContext.currentTenantId(),
            userId: RequestContext.currentUserId(),
            xpertId: draftContext.xpertId,
            workspaceId: draftContext.workspaceId,
            workspaceDataScope: draftContext.workspaceDataScope,
            xpertFeatures: draftContext.xpertFeatures,
            node: this.createMiddlewareNode(provider, body?.options),
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
