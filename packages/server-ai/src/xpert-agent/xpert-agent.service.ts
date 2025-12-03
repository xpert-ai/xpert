import { STATE_VARIABLE_HUMAN, TChatAgentParams, TChatOptions } from '@metad/contracts'
import { TenantOrganizationAwareCrudService } from '@metad/server-core'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { AgentMiddlewareRegistry, RequestContext } from '@xpert-ai/plugin-sdk'
import { assign } from 'lodash'
import { Observable } from 'rxjs'
import { Repository } from 'typeorm'
import { XpertAgentChatCommand } from './commands'
import { XpertAgent } from './xpert-agent.entity'
import { FindXpertQuery } from '../xpert/queries'

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

	async chatAgent(params: TChatAgentParams, options: TChatOptions) {
		const xpertId = params.xpertId
		const xpert = await this.queryBus.execute(new FindXpertQuery({ id: xpertId }, {relations: ['agent'], isDraft: true}))
		return await this.commandBus.execute<XpertAgentChatCommand, Observable<MessageEvent>>(
			new XpertAgentChatCommand({[STATE_VARIABLE_HUMAN]: params.input}, params.agentKey, xpert, {
				...options,
				isDraft: true,
				store: null,
				execution: {
					id: params.executionId,
					category: 'agent'
				},
				command: params.command,
				reject: params.reject,
				from: 'debugger'
			})
		)
	}

	getMiddlewareStrategies() {
		return this.agentMiddlewareRegistry.list().map((strategy) => {
			return {
				meta: strategy.meta,
			}
		})
	}

	async getMiddlewareTools(provider: string, options: any) {
		const strategy = this.agentMiddlewareRegistry.get(provider)
		const middleware = await strategy.createMiddleware(options, {tenantId: RequestContext.currentTenantId(), userId: RequestContext.currentUserId()})
		return middleware.tools?.map((tool) => ({
			name: tool.name,
			description: tool.description,
			schema: JSON.parse(JSON.stringify(tool.schema)),
		})) ?? []
	}
}
