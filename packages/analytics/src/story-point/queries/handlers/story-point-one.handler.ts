import { Visibility } from '@metad/contracts'
import { RequestContext } from '@metad/server-core'
import { Logger, NotFoundException } from '@nestjs/common'
import { CommandBus, IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Brackets, Repository } from 'typeorm'
import { BusinessArea, BusinessAreaMyCommand } from '../../../business-area'
import { StoryPoint } from '../../story-point.entity'
import { StoryPointOneQuery } from '../story-point-one.query'

@QueryHandler(StoryPointOneQuery)
export class StoryPointOneHandler implements IQueryHandler<StoryPointOneQuery> {
	private readonly logger = new Logger(StoryPointOneHandler.name)
	constructor(
		private readonly commandBus: CommandBus,
		@InjectRepository(StoryPoint)
		private repository: Repository<StoryPoint>
	) {}

	async execute(query: StoryPointOneQuery) {
		const { id, options } = query
		const { relations } = options ?? {}

		const tenantId = RequestContext.currentTenantId()
		// const organizationId = RequestContext.getOrganizationId()
		const me = RequestContext.currentUser()

		const areas = await this.commandBus.execute<BusinessAreaMyCommand, BusinessArea[]>(
			new BusinessAreaMyCommand(me)
		)

		const _baseQb = this.repository.createQueryBuilder('storyPoint')
			.leftJoinAndSelect('storyPoint.story', 'story')
			.leftJoinAndSelect('story.project', 'project')
			.leftJoinAndSelect('project.members', 'member')
		
		// // Filter have used relations
		// relations?.filter((relation) => !['story', 'story.project', 'project.members'].includes(relation))
		// 	.forEach((relation) => {
		// 		const entities = relation.split('.')
		// 		if (entities.length > 1) {
		// 			_baseQb.leftJoinAndSelect(entities.slice(entities.length - 2, entities.length).join('.'), entities[entities.length - 1])
		// 		} else {
		// 			_baseQb.leftJoinAndSelect(`storyPoint.${relation}`, relation)
		// 		}
		// 	})

		const qb = _baseQb
			.where('storyPoint.id = :id')
			.andWhere('story.tenantId = :tenantId')
			.andWhere(new Brackets((qb) => {
				qb.where('story.createdById = :me')
					.orWhere('member.id = :me')
					.orWhere('story.visibility = :visibility')
				if (areas.length) {
					qb.orWhere('story.businessAreaId IN (:...areas)')
				}
			}))
			.setParameters({
				id,
				me: me.id,
				tenantId,
				areas: areas.map((item) => item.id),
				visibility: Visibility.Public
			})

		this.logger.debug(qb.getSql())

		const record = await qb.getOne()
		if (!record) {
			throw new NotFoundException(`The requested record was not found`)
		}
		
		return await this.repository.findOne({where: {id}, relations })
	}
}
