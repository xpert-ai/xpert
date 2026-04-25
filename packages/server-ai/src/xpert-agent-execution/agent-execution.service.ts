import { PaginationParams, RequestContext, TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { assign } from 'lodash'
import { FindManyOptions, IsNull, Repository } from 'typeorm'
import { XpertAgentExecution } from './agent-execution.entity'

@Injectable()
export class XpertAgentExecutionService extends TenantOrganizationAwareCrudService<XpertAgentExecution> {
	constructor(
		@InjectRepository(XpertAgentExecution)
		repository: Repository<XpertAgentExecution>
	) {
		super(repository)
	}

	async update(id: string, entity: Partial<XpertAgentExecution>) {
		const _entity = await super.findOne(id)
		assign(_entity, entity)
		return await this.repository.save(_entity)
	}

	async findAllByParentId(id: string, options?: Omit<FindManyOptions<XpertAgentExecution>, 'where'>) {
		const { items } = await this.findAll({
			...(options ?? {}),
			where: {
				parentId: id
			}
		})
		return items
	}

	async findAllByXpertAgent(xpertId: string, agentKey: string, options: PaginationParams<XpertAgentExecution>) {
		return await this.findAll({ ...options, where: { xpertId, agentKey, parentId: IsNull() } })
	}
}
