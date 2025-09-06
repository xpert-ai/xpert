import { Logger } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Brackets, FindOptionsRelationByString, Repository } from 'typeorm'
import { GetXpertWorkspaceQuery } from '../get-one.query'
import { XpertWorkspace } from '../../workspace.entity'

@QueryHandler(GetXpertWorkspaceQuery)
export class GetXpertWorkspaceHandler implements IQueryHandler<GetXpertWorkspaceQuery> {
	private readonly logger = new Logger(GetXpertWorkspaceHandler.name)
	constructor(
		@InjectRepository(XpertWorkspace)
		private repository: Repository<XpertWorkspace>,
	) {}

	async execute(query: GetXpertWorkspaceQuery) {
		const { user, input } = query
		const { id, options } = input
		const relations = options?.relations as FindOptionsRelationByString

		if (!id || id === 'null') {

			return {
	
			}
		}

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
			.andWhere('workspace.id = :id')
			.andWhere(new Brackets((qb) => {
				qb.where('workspace.ownerId = :userId')
				qb.orWhere('user.id = :userId')
			}))
			.setParameters({
				id,
				tenantId: user.tenantId,
				userId: user.id
			})
		const record = await qb.getOne()
		return record
	}
}
