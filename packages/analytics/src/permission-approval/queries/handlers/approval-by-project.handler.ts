import { ApprovalPolicyTypesStringEnum, BusinessAreaRole } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { Logger } from '@nestjs/common'
import { CommandBus, IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { BusinessAreaDTO } from '../../../business-area/index'
import { Brackets, ObjectLiteral, Repository } from 'typeorm'
import { BusinessAreaMyCommand } from '../../../business-area'
import { BusinessArea, PermissionApproval } from '../../../core/entities/internal'
import { ApprovalsByProjectQuery } from '../approval-by-project.query'

@QueryHandler(ApprovalsByProjectQuery)
export class ApprovalsByProjectHandler implements IQueryHandler<ApprovalsByProjectQuery> {

	private readonly logger = new Logger(ApprovalsByProjectHandler.name)
	constructor(
		private readonly commandBus: CommandBus,
		@InjectRepository(PermissionApproval)
		private repository: Repository<PermissionApproval>
	) {}

	async execute(query: ApprovalsByProjectQuery) {
		const input = query.input
		const { projectId, options } = input ?? {}
		const { relations, where, order } = options ?? {}

		const me = RequestContext.currentUser()

		const businessAreas: BusinessAreaDTO[] = await this.commandBus.execute(new BusinessAreaMyCommand(me, BusinessAreaRole.Modeler))

		let qb = this.repository.createQueryBuilder('permission_approval')
		qb.leftJoinAndSelect(`${qb.alias}.approvalPolicy`, 'approvalPolicy')
		qb.leftJoinAndSelect(`${qb.alias}.indicator`, 'indicator')
		qb.leftJoinAndSelect(`${qb.alias}.userApprovals`, 'userApprovals')
		qb.leftJoinAndSelect(`${qb.alias}.createdBy`, 'createdBy')
		qb.leftJoinAndSelect(`userApprovals.user`, 'userApprovalUser')
		qb.leftJoinAndMapOne('permission_approval.indicatorGroup', BusinessArea, 'indicatorGroup', `${qb.alias}.permissionType = '${ApprovalPolicyTypesStringEnum.BUSINESS_AREA}' AND ${qb.alias}.permissionId = "indicatorGroup"."id"::"varchar"`)

		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()

		qb = qb.where({
			...(<ObjectLiteral>where ?? {}),
			tenantId,
			organizationId
		}).andWhere(new Brackets((sqb) => {
			if (projectId) {
				// 1. Project indicators
				sqb.where(
					new Brackets((sqb) => {
						sqb.where('indicator.organizationId = :organizationId')
						.andWhere('indicator.tenantId = :tenantId')
						.andWhere('indicator.projectId = :projectId')
					})
				)
			} else {
				// 2. My own indicators not in project
				sqb.where(
					new Brackets((sqb) => {
						sqb.where('indicator.organizationId = :organizationId')
						.andWhere('indicator.tenantId = :tenantId')
						.andWhere('indicator.projectId IS NULL')
						.andWhere('indicator.createdById = :userId')
					})
				)
				// 3. Indicators in business area
				if (businessAreas.length) {
					sqb.orWhere(
						new Brackets((sqb) => {
							sqb.where(`permission_approval.permissionType = '${ApprovalPolicyTypesStringEnum.BUSINESS_AREA}' AND permission_approval.permissionId IN (:...businessAreas)`,
								{
									businessAreas: businessAreas.map(({ id }) => id)
								}
							)
						})
					)
				}
			}
			
		}))

		if (order) {
			Object.keys(order).forEach((key) => qb.addOrderBy(`${qb.alias}.${key}`, order[key]))
		}
		
		qb.setParameters({
			tenantId,
			organizationId,
			projectId,
			userId: me.id
		})

		this.logger.debug(qb.getSql())
        
		const [items, total] = await qb.getManyAndCount()

		return {
			items,
			total
		}
	}
}
