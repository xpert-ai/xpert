import { Visibility } from '@metad/contracts'
import { RequestContext } from '@metad/server-core'
import { Logger, NotFoundException } from '@nestjs/common'
import { CommandBus, IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Brackets, Repository } from 'typeorm'
import { BusinessArea, BusinessAreaMyCommand } from '../../../business-area'
import { Story } from '../../story.entity'
import { StoryOneQuery } from '../story-one.query'

@QueryHandler(StoryOneQuery)
export class StoryOneHandler implements IQueryHandler<StoryOneQuery> {
	private readonly logger = new Logger(StoryOneHandler.name)
	constructor(
		private readonly commandBus: CommandBus,
		@InjectRepository(Story)
		private repository: Repository<Story>
	) {}

	async execute(query: StoryOneQuery) {
		const { id, options } = query
		const { relations } = options ?? {}

		const tenantId = RequestContext.currentTenantId()
		const me = RequestContext.currentUser()

		const areas = await this.commandBus.execute<BusinessAreaMyCommand, BusinessArea[]>(
			new BusinessAreaMyCommand(me)
		)

		const _baseQb = this.repository.createQueryBuilder('story')
		
		// Filter have used relations
		// relations?.filter((relation) => !['project', 'project.members'].includes(relation))
		// 	.forEach((relation) => {
		// 		const entities = relation.split('.')
		// 		if (entities.length > 1) {
		// 			_baseQb.leftJoinAndSelect(entities.slice(entities.length - 2, entities.length).join('.'), entities[entities.length - 1])
		// 		} else {
		// 			_baseQb.leftJoinAndSelect(`story.${relation}`, relation)
		// 		}
		// 	})

		const qb = _baseQb
			.leftJoinAndSelect('story.project', 'project')
			.leftJoinAndSelect('project.members', 'member')
			.where('story.id = :id')
			.andWhere('story.tenantId = :tenantId')
			.andWhere(new Brackets((qb) => {
				qb = qb.where('story.createdById = :me')
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
		
		return await this.repository.findOne({ where: {id}, relations })
	}
}
