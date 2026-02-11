import { PaginationParams, TenantOrganizationAwareCrudService } from '@metad/server-core'
import { Injectable, Logger } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { assign } from 'lodash'
import { FindOneOptions, IsNull, Repository } from 'typeorm'
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
		let _entity: XpertAgentExecution | null = null
		try {
			_entity = await super.findOne(id)
		} catch (error: any) {
			if (isNotFoundError(error)) {
				this.#logger.debug(
					`Scoped execution lookup missed id=${id}, falling back to id-only lookup`
				)
				_entity = await this.findOneByIdAnyScope(id)
			} else {
				throw error
			}
		}

		if (!_entity) {
			throw new Error(`Execution ${id} not found`)
		}
		assign(_entity, entity)
		return await this.repository.save(_entity)
	}

	async findOneByIdAnyScope(
		id: string,
		options?: FindOneOptions<XpertAgentExecution>
	): Promise<XpertAgentExecution | null> {
		return this.repository.findOne({
			...(options ?? {}),
			where: {
				id,
				...((options?.where as Record<string, any>) ?? {})
			} as any
		})
	}

	async findAllByXpertAgent(xpertId: string, agentKey: string, options: PaginationParams<XpertAgentExecution>) {
		return await this.findAll({ ...options, where: { xpertId, agentKey, parentId: IsNull() } })
	}
}

function isNotFoundError(error: unknown): boolean {
	if (!error || typeof error !== 'object') {
		return false
	}
	const anyError = error as any
	return (
		anyError?.status === 404 ||
		anyError?.response?.statusCode === 404 ||
		`${anyError?.message ?? ''}`.includes('requested record was not found')
	)
}
