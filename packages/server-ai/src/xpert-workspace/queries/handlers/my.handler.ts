import { RequestContext } from '@metad/server-core'
import { Logger } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Brackets, FindOptionsRelationByString, Repository } from 'typeorm'
import { MyXpertWorkspaceQuery } from '../my.query'
import { XpertWorkspace } from '../../workspace.entity'

@QueryHandler(MyXpertWorkspaceQuery)
export class MyXpertWorkspaceHandler implements IQueryHandler<MyXpertWorkspaceQuery> {
	private readonly logger = new Logger(MyXpertWorkspaceHandler.name)
	constructor(
		@InjectRepository(XpertWorkspace)
		private repository: Repository<XpertWorkspace>,
	) {}

	async execute(query: MyXpertWorkspaceQuery) {
		const { userId, input } = query
		const relations = input?.relations as FindOptionsRelationByString
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()

		const _baseQb = this.repository.createQueryBuilder('workspace')
		// Filter have used relations
		relations?.filter((relation) => !['members'].includes(relation))
			.forEach((relation) => {
				const entities = relation.split('.')
				if (entities.length > 1) {
					_baseQb.leftJoinAndSelect(entities.slice(entities.length - 2, entities.length).join('.'), entities[entities.length - 1])
				} else {
					_baseQb.leftJoinAndSelect(`workspace.${relation}`, relation)
				}
			})

		const qb = _baseQb.leftJoinAndSelect('workspace.members', 'user')
			.where('workspace.tenantId = :tenantId')
			.andWhere('workspace.organizationId = :organizationId')
			.andWhere(new Brackets((qb) => {
				qb.where('workspace.ownerId = :userId')
				qb.orWhere('user.id = :userId')
			}))
			.setParameters({
				tenantId,
				organizationId,
				userId
			})

		const [items, total] = await qb.getManyAndCount()
		return {
			items,
			total
		}
	}
}
