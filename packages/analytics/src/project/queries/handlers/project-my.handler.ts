import { RequestContext } from '@metad/server-core'
import { Logger } from '@nestjs/common'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Brackets, FindOptionsRelationByString, Repository } from 'typeorm'
import { Project } from '../../project.entity'
import { ProjectService } from '../../project.service'
import { ProjectMyQuery } from '../project-my.query'

@QueryHandler(ProjectMyQuery)
export class ProjectMyHandler implements IQueryHandler<ProjectMyQuery> {
	private readonly logger = new Logger(ProjectMyQuery.name)
	constructor(private readonly queryBus: QueryBus,
		@InjectRepository(Project)
		private repository: Repository<Project>,
		private readonly projectService: ProjectService) {}

	async execute(query: ProjectMyQuery) {
		const { input } = query
		const relations = input?.relations as FindOptionsRelationByString
		const user = RequestContext.currentUser()
		const organizationId = RequestContext.getOrganizationId()

		const _baseQb = this.repository.createQueryBuilder('project')
		// Filter have used relations
		relations?.filter((relation) => !['members'].includes(relation))
			.forEach((relation) => {
				const entities = relation.split('.')
				if (entities.length > 1) {
					_baseQb.leftJoinAndSelect(entities.slice(entities.length - 2, entities.length).join('.'), entities[entities.length - 1])
				} else {
					_baseQb.leftJoinAndSelect(`project.${relation}`, relation)
				}
			})

		const qb = _baseQb.leftJoinAndSelect('project.members', 'user')
			.where('project.tenantId = :tenantId')
			.andWhere('project.organizationId = :organizationId')
			.andWhere(new Brackets((qb) => {
				qb.where('project.ownerId = :userId')
				qb.orWhere('user.id = :userId')
			}))
			.setParameters({
				tenantId: user.tenantId,
				organizationId,
				userId: user.id
			})

		const [items, total] = await qb.getManyAndCount()
		return {
			items,
			total
		}
	}
}
