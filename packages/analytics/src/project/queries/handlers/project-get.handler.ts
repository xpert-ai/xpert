import { RequestContext } from '@metad/server-core'
import { Logger } from '@nestjs/common'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { IndicatorsByProjectQuery } from '../../../indicator/queries'
import { Brackets, Repository } from 'typeorm'
import { Project } from '../../../core/entities/internal'
import { ModelsQuery } from '../../../model/queries'
import { ProjectGetQuery } from '../project-get.query'
import { CertificationMyQuery } from '../../../certification'

@QueryHandler(ProjectGetQuery)
export class ProjectGetHandler implements IQueryHandler<ProjectGetQuery> {
	private readonly logger = new Logger(ProjectGetHandler.name)
	
	constructor(
		private readonly queryBus: QueryBus,
		@InjectRepository(Project)
		private repository: Repository<Project>,
	) {}

	async execute(query: ProjectGetQuery) {
		const { input } = query
		const { id, options } = input
		const relations = options?.relations
		const user = RequestContext.currentUser()
		const organizationId = RequestContext.getOrganizationId()

		if (!id || id === 'null') {
			const models = await this.queryBus.execute(new ModelsQuery({ options: {} }))
			const {items: indicators} = await this.queryBus.execute(new IndicatorsByProjectQuery(null, {
				relations: ['businessArea']
			}))
			const {items: certifications} = await this.queryBus.execute(new CertificationMyQuery({}))
			return {
				models,
				indicators,
				certifications
			}
		}

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
			.andWhere('project.id = :id')
			.andWhere(new Brackets((qb) => {
				qb.where('project.ownerId = :userId')
				qb.orWhere('user.id = :userId')
			}))
			.setParameters({
				id,
				tenantId: user.tenantId,
				organizationId,
				userId: user.id
			})
		const record = await qb.getOne()
		return record
	}
}
