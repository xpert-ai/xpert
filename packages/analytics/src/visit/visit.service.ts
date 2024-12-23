import { AnalyticsPermissionsEnum, IEntityVisits, VisitEntityEnum, VisitTypeEnum } from '@metad/contracts'
import { RequestContext, TenantOrganizationAwareCrudService } from '@metad/server-core'
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { subDays } from 'date-fns'
import { Brackets, In, IsNull, MoreThan, Not, Repository, SelectQueryBuilder, WhereExpressionBuilder } from 'typeorm'
import { StoryService } from '../story/story.service'
import { VisitPublicDTO } from './dto/public.dto'
import { Visit } from './visit.entity'


@Injectable()
export class VisitService extends TenantOrganizationAwareCrudService<Visit> {

	private readonly logger = new Logger(VisitService.name)

	constructor(
		@InjectRepository(Visit)
		private readonly visitRepository: Repository<Visit>,
		private readonly storyService: StoryService
	) {
		super(visitRepository)
	}

	public async myRecent(take = 20): Promise<VisitPublicDTO[]> {
		const tenantId = RequestContext.currentTenantId()
		const userId = RequestContext.currentUserId()
		const organizationId = RequestContext.getOrganizationId()

		const subQb = this.repository.manager
			.createQueryBuilder()
			.select(`v.id AS "id"`)
			.from(Visit, 'v')
			.innerJoin((subQb) => {
				return subQb
					.select(`visit."tenantId" AS "tenantId"`)
					.addSelect(`visit.entity AS "entity"`)
					.addSelect(`visit."entityId" AS "entityId"`)
					.addSelect(`MAX(visit.updatedAt) AS "updatedAt"`)
					.from(Visit, 'visit')
					.where(`visit."tenantId" = '${tenantId}'`)
					.andWhere(`visit."type" = '${VisitTypeEnum.View}'`)
					.andWhere(`visit."createdById" = '${userId}'`)
					.andWhere(organizationId ? `visit."organizationId" = '${organizationId}'` : `visit."organizationId" IS NULL`)
					.andWhere(RequestContext.hasPermission(AnalyticsPermissionsEnum.MODELS_EDIT) ?
						`visit."entity" IN ('${VisitEntityEnum.SemanticModel}', '${VisitEntityEnum.Indicator}', '${VisitEntityEnum.Story}')` : 
						`visit."entity" IN ('${VisitEntityEnum.Indicator}', '${VisitEntityEnum.Story}')`)
					.addGroupBy('visit.tenantId')
					.addGroupBy('visit.entity')
					.addGroupBy('visit.entityId')
			}, 'visit', `v."tenantId" = visit."tenantId" AND v."entityId" = visit."entityId" AND v."updatedAt" = visit."updatedAt"`)
		
		this.logger.verbose('My Recent query: ' + subQb.getSql())
		
		const [items] = await this.repository.findAndCount({
			relations: ['story', 'model', 'indicator', 'createdBy'],
			take,
			order: {
				updatedAt: 'DESC'
			},
			where: (query: SelectQueryBuilder<Visit>) => {
				const tenantId = RequestContext.currentTenantId()
				const organizationId = RequestContext.getOrganizationId()
				query.andWhere(
					new Brackets((qb: WhereExpressionBuilder) => { 
						qb.andWhere(`"${query.alias}"."tenantId" = :tenantId`, { tenantId });
						qb.andWhere(`"${query.alias}"."organizationId" = :organizationId`, { organizationId });
					})
				)
				
				query.andWhere(`"${query.alias}"."id" IN (${subQb.getQuery()})`)
			}
		})

		return items.map((item) => new VisitPublicDTO(item))
	}

	public async recentRanking(owner: 'all' | 'my', entity?: VisitEntityEnum, days = 7): Promise<IEntityVisits[]> {
		const { items: myStories } =
			owner === 'all' ? await this.storyService.findMy() : await this.storyService.findMyAll()
		const recentDay = Number(
			subDays(new Date(), days || 7)
				.toISOString()
				.slice(0, 10)
				.replace(/-/g, '')
		)
		const items = await this.repository
			.createQueryBuilder('visit')
			.select(`visit.entityId AS "entityId"`)
			.addSelect(`visit.entityName AS "entityName"`)
			.addSelect('SUM(visit.visits) AS PV')
			.addSelect('COUNT(DISTINCT visit.createdById) AS UV')
			.andWhere({
				entityId: In(myStories.map((item) => item.id)),
				type: VisitTypeEnum.View,
				entity: entity || Not(IsNull()),
				visitAt: MoreThan(recentDay)
			})
			.addGroupBy('visit.entityId')
			.addGroupBy('visit.entityName')
			.addOrderBy('PV', 'DESC')
			.getRawMany()

		return items
	}

}
