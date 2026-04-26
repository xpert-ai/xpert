import {
    IXpert,
    IWFNMiddleware,
    STATE_VARIABLE_HUMAN,
    TChatOptions,
    TXpertAgentChatRequest,
    WorkflowNodeTypeEnum
} from '@xpert-ai/contracts'
import { TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { AgentMiddlewareRegistry, RequestContext } from '@xpert-ai/plugin-sdk'
import { assign } from 'lodash'
import { Observable } from 'rxjs'
import { Repository } from 'typeorm'
import { ToolSchemaParser } from '../shared/tools/utils'
import { AgentMiddlewareRuntimeService } from '../shared/agent/middleware-runtime.service'
import { FindXpertQuery } from '../xpert/queries'
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
        private readonly agentMiddlewareRuntimeService: AgentMiddlewareRuntimeService
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
        return this.agentMiddlewareRegistry.list().map((strategy) => {
            return {
                meta: strategy.meta
            }
        })
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

    private async getDraftXpertFeatures(xpertId?: string) {
        if (!xpertId) {
            return null
        }

        const xpert = await this.queryBus.execute<FindXpertQuery, Pick<IXpert, 'features'> | null>(
            new FindXpertQuery({ id: xpertId }, { isDraft: true })
        )

        return xpert?.features ?? null
    }

    async getMiddlewareTools(provider: string, body: { xpertId?: string; options?: any }) {
        const strategy = this.agentMiddlewareRegistry.get(provider)
        const xpertFeatures = await this.getDraftXpertFeatures(body?.xpertId)
        const middleware = await strategy.createMiddleware(body?.options, {
            tenantId: RequestContext.currentTenantId(),
            userId: RequestContext.currentUserId(),
            xpertId: body?.xpertId,
            xpertFeatures,
            node: this.createMiddlewareNode(provider, body?.options),
            tools: new Map(),
            runtime: this.agentMiddlewareRuntimeService.api
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
        const xpertFeatures = await this.getDraftXpertFeatures(body?.xpertId)
        const middleware = await strategy.createMiddleware(body?.options, {
            tenantId: RequestContext.currentTenantId(),
            userId: RequestContext.currentUserId(),
            xpertId: body?.xpertId,
            xpertFeatures,
            node: this.createMiddlewareNode(provider, body?.options),
            tools: new Map(),
            runtime: this.agentMiddlewareRuntimeService.api
        })
        const tool = middleware?.tools?.find((tool) => tool.name === toolName)
        if (!tool) {
            throw new Error(`Middleware tool '${toolName}' not found in provider '${provider}'`)
        }
        return await tool.invoke(body?.parameters ?? {})
    }
}
