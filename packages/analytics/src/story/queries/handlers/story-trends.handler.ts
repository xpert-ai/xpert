import { DEFAULT_TENANT, StoryStatusEnum } from '@metad/contracts'
import { RequestContext, TenantService, User } from '@metad/server-core'
import { Logger } from '@nestjs/common'
import { CommandBus, IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { FindOneOptions, ILike, Repository } from 'typeorm'
import { Story } from '../../story.entity'
import { StoryTrendsQuery } from '../story-trends.query'

@QueryHandler(StoryTrendsQuery)
export class StoryTrendsHandler implements IQueryHandler<StoryTrendsQuery> {
	private readonly logger = new Logger(StoryTrendsQuery.name)
	constructor(
		private readonly commandBus: CommandBus,
		@InjectRepository(Story)
		private repository: Repository<Story>,
		private tenantService: TenantService
	) {}

	async execute(query: StoryTrendsQuery) {
		const { searchText, options, orderType } = query
		const { skip, take } = options ?? {}

		const tenantId =
			RequestContext.currentTenantId() ?? (await this.tenantService.findOneByWhereOptions({ name: DEFAULT_TENANT }))?.id

		let where: FindOneOptions['where'] = {
			tenantId,
			visibility: 'public',
			status: StoryStatusEnum.RELEASED
		}

		if (searchText) {
			where = [
				{
					...where,
					name: ILike(`%${searchText}%`)
				},
				{
					...where,
					description: ILike(`%${searchText}%`)
				}
			]
		}

		const qb = this.repository.manager
			.createQueryBuilder()
			.select('*')
			.take(take)
			.skip(skip)
			.from((qb) => {
				return qb
					.subQuery()
					.from(Story, 'story')
					.leftJoinAndSelect('story.visits', 'visit')
					.leftJoinAndSelect('story.updatedBy', 'updatedBy')
					.select('story')
					.addSelect('updatedBy')
					.addSelect('SUM(visit.visits) AS "story_pv"')
					.where(where)
					.groupBy('story.id')
					.addGroupBy('updatedBy.id')
			}, 'story')

		if (orderType === 'visits') {
			qb.orderBy('"story_pv"', 'DESC')
		} else {
			qb.orderBy('"story_updatedAt"', 'DESC')
		}

		this.logger.debug(qb.getSql())

		const items = await qb.getRawMany()

		return {
			items: items.map((item) => {
				const story = new Story()
				story.updatedBy = new User()
				Object.keys(item).forEach((key) => {
					key.startsWith('story_') && (story[key.replace('story_', '')] = item[key])
					key.startsWith('updatedBy_') && (story.updatedBy[key.replace('updatedBy_', '')] = item[key])
				})

				return story
			})
		}
	}
}
