import { PaginationParams, TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { Injectable, Logger } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { assign } from 'lodash'
import { IsNull, Repository } from 'typeorm'
import { XpertAgentExecution } from './agent-execution.entity'

@Injectable()
export class XpertAgentExecutionService extends TenantOrganizationAwareCrudService<XpertAgentExecution> {
	readonly #logger = new Logger(XpertAgentExecutionService.name)

	constructor(
		@InjectRepository(XpertAgentExecution)
		repository: Repository<XpertAgentExecution>,
		private readonly commandBus: CommandBus,
	) {
		super(repository)
	}

	async update(id: string, entity: Partial<XpertAgentExecution>) {
		const _entity = await super.findOne(id)
		assign(_entity, entity)
		return await this.repository.save(_entity)
	}

	async findAllByXpertAgent(xpertId: string, agentKey: string, options: PaginationParams<XpertAgentExecution>) {
		return await this.findAll({ ...options, where: { xpertId, agentKey, parentId: IsNull() } })
	}
}
