import { TChatAgentParams, TChatOptions } from '@metad/contracts'
import { TenantOrganizationAwareCrudService } from '@metad/server-core'
import { Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { assign } from 'lodash'
import { Observable } from 'rxjs'
import { Repository } from 'typeorm'
import { XpertAgentChatCommand } from './commands'
import { XpertAgent } from './xpert-agent.entity'
import { FindXpertQuery } from '../xpert/queries'

@Injectable()
export class XpertAgentService extends TenantOrganizationAwareCrudService<XpertAgent> {
	readonly #logger = new Logger(XpertAgentService.name)

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
		const xpert = await this.queryBus.execute(new FindXpertQuery({ id: xpertId }, ['agent']))
		return await this.commandBus.execute<XpertAgentChatCommand, Observable<MessageEvent>>(
			new XpertAgentChatCommand(params.input, params.agentKey, xpert, {
				...options,
				isDraft: true,
				execution: {
					id: params.executionId,
					category: 'agent'
				},
				operation: params.operation,
				reject: params.reject,
				from: 'debugger'
			})
		)
	}
}
