import {
    IWFNMiddleware,
    STATE_VARIABLE_HUMAN,
    TChatOptions,
    TXpertAgentChatRequest,
    WorkflowNodeTypeEnum
} from '@metad/contracts'
import { TenantOrganizationAwareCrudService } from '@metad/server-core'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { AgentMiddlewareRegistry, RequestContext } from '@xpert-ai/plugin-sdk'
import { assign } from 'lodash'
import { Observable } from 'rxjs'
import { Repository } from 'typeorm'
import { ToolSchemaParser } from '../shared'
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
        private readonly queryBus: QueryBus
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

    async getMiddlewareTools(provider: string, options: any) {
        const strategy = this.agentMiddlewareRegistry.get(provider)
        const middleware = await strategy.createMiddleware(options, {
            tenantId: RequestContext.currentTenantId(),
            userId: RequestContext.currentUserId(),
            node: this.createMiddlewareNode(provider, options),
            tools: new Map()
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
        body: { options?: any; parameters?: Record<string, any> }
    ) {
        const strategy = this.agentMiddlewareRegistry.get(provider)
        const middleware = await strategy.createMiddleware(body?.options, {
            tenantId: RequestContext.currentTenantId(),
            userId: RequestContext.currentUserId(),
            node: this.createMiddlewareNode(provider, body?.options),
            tools: new Map()
        })
        const tool = middleware?.tools?.find((tool) => tool.name === toolName)
        if (!tool) {
            throw new Error(`Middleware tool '${toolName}' not found in provider '${provider}'`)
        }
        return await tool.invoke(body?.parameters ?? {})
    }
}
