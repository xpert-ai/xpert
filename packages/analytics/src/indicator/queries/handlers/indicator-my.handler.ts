import { ApprovalPolicyTypesStringEnum, PermissionApprovalStatusTypesEnum } from '@metad/contracts'
import { RequestContext } from '@metad/server-core'
import { Logger } from '@nestjs/common'
import { CommandBus, IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Brackets, FindOptionsRelationByString, ObjectLiteral, Repository } from 'typeorm'
import { BusinessAreaMyCommand } from '../../../business-area'
import { BusinessArea, PermissionApproval } from '../../../core/entities/internal'
import { Indicator } from '../../indicator.entity'
import { IndicatorMyQuery } from '../indicator-my.query'

@QueryHandler(IndicatorMyQuery)
export class IndicatorMyHandler implements IQueryHandler<IndicatorMyQuery> {

	private readonly logger = new Logger(IndicatorMyHandler.name)
	constructor(
		private readonly commandBus: CommandBus,
		@InjectRepository(Indicator)
		private indicatorRepository: Repository<Indicator>
	) {}

	async execute(query: IndicatorMyQuery) {
		const { options } = query
		const relations = options?.relations as FindOptionsRelationByString
		const where = <ObjectLiteral>options?.where ?? {}

		const me = RequestContext.currentUser()
		const businessAreas = await this.commandBus.execute(new BusinessAreaMyCommand(me))

		const queryBuilder = this.indicatorRepository.createQueryBuilder('indicator').select()

		queryBuilder.leftJoin(
			PermissionApproval,
			'permission_approval',
			'indicator.id = permission_approval.indicatorId'
		)

		queryBuilder.leftJoin('permission_approval.userApprovals', 'userApprovals')
		queryBuilder.leftJoinAndMapOne('indicator.businessArea', BusinessArea, 'businessArea', 'indicator.businessAreaId = businessArea.id')

		// Filter have used relations
		relations?.filter((relation) => !['permissionApproval', 'permissionApproval.userApprovals', 'businessArea'].includes(relation))
			.forEach((relation) => {
				const entities = relation.split('.')
				if (entities.length > 1) {
					queryBuilder.leftJoinAndSelect(entities.slice(entities.length - 2, entities.length).join('.'), entities[entities.length - 1])
				} else {
					queryBuilder.leftJoinAndSelect(`indicator.${relation}`, relation)
				}
			})

		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()
		queryBuilder
			.where({
				tenantId,
				organizationId,
				...where
			})
			.andWhere(
				new Brackets((sqb) => {
					// 1. Created by me
					sqb.where({
						createdById: me.id
					})
					// 2. Have approval single indicator
					.orWhere(
						new Brackets((sqb2) => {
							sqb2.where('permission_approval.status = 2').andWhere(
								'userApprovals.userId = :userId',
								{ userId: me.id }
							)
						})
					)
					// 3. Have approval business area
					.orWhere(`"${queryBuilder.alias}"."businessAreaId"::"varchar" IN ` + queryBuilder.subQuery()
						.select(`permissionApprovalG.permissionId`)
						.from(PermissionApproval, "permissionApprovalG")
						.leftJoin('permissionApprovalG.userApprovals', 'userApprovals')
						.where({
							tenantId,
							organizationId,
							permissionType: ApprovalPolicyTypesStringEnum.BUSINESS_AREA,
							status: PermissionApprovalStatusTypesEnum.APPROVED
						})
						.andWhere('userApprovals.userId = :userId', {userId: me.id})
						.getQuery()

					)
					// 4. I am one of the business area members
					if (businessAreas.length) {
						sqb.orWhere(
							new Brackets((sqb1) => {
								sqb1.where(`${queryBuilder.alias}.businessAreaId IN (:...businessAreas)`, {
									businessAreas: businessAreas.map(({ id }) => id)
								})
							})
						)
					}
				})
			)

		this.logger.verbose(`Query my indicators: ` + queryBuilder.getSql())
        
		const [items, total] = await queryBuilder.getManyAndCount()

		return {
			items,
			total
		}
	}
}
