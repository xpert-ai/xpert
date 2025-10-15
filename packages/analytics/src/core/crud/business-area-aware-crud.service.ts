import { BusinessAreaRole } from '@metad/contracts'
import {
	RequestContext,
	TenantOrganizationAwareCrudService,
	TenantOrganizationBaseEntity,
} from '@metad/server-core'
import { CommandBus } from '@nestjs/cqrs'
import {
	FindManyOptions,
	In,
	Repository,
} from 'typeorm'
import { BusinessAreaMyCommand } from '../../business-area/commands'
import { BusinessArea } from '../entities/internal'

export abstract class BusinessAreaAwareCrudService<
	T extends TenantOrganizationBaseEntity
> extends TenantOrganizationAwareCrudService<T> {
	protected constructor(
		protected readonly repository: Repository<T>,
		protected readonly commandBus: CommandBus,
	) {
		super(repository)
	}

	/**
	 * Add my business areas and i created query conditions:
	 * 
	 * - Entities under the business areas I have authority over
	 * - Entities I created
	 * 
	 * @param conditions 
	 * @param role 
	 * @returns 
	 */
	async myBusinessAreaConditions(conditions?: FindManyOptions<T>, role?: BusinessAreaRole): Promise<FindManyOptions<T>> {
		const user = RequestContext.currentUser()
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()

		const areas = await this.commandBus.execute<BusinessAreaMyCommand, BusinessArea[]>(new BusinessAreaMyCommand(user, role))

		/**
		 * TypeORM 0.3.x `FindManyOptions.where` must be:
		 * - a simple object
		 * - or an array of OR conditions
		 * No functions or query builders allowed.
		 */
		const baseWhere: any = {
			tenantId,
			organizationId
		}

		// Combine your extra "business area" condition
		const accessCondition = [
			{ createdById: user.id },
			{ businessAreaId: In(areas.map((a) => a.id)) }
		]

		// Merge with user-provided where
		let mergedWhere: any
		if (Array.isArray(conditions?.where)) {
			// Combine each existing OR with accessCondition (cartesian style)
			mergedWhere = conditions.where.flatMap((w) =>
			accessCondition.map((a) => ({ ...baseWhere, ...w, ...a }))
			)
		} else if (typeof conditions?.where === 'object' && conditions?.where !== null) {
			mergedWhere = accessCondition.map((a) => ({
			...baseWhere,
			...(conditions.where as object),
			...a
			}))
		} else {
			// no user where — just restrict by area
			mergedWhere = accessCondition.map((a) => ({
			...baseWhere,
			...a
			}))
		}

		return {
			...(conditions ?? {}),
			where: mergedWhere
		}

		// return {
		// 	...(conditions ?? {}),
		// 	// @todo TypeORM 0.3.x migration - find options to query builder
		// 	// https://typeorm.io/select-query-builder
		// 	where: (query: SelectQueryBuilder<T>) => {
		// 		query.andWhere(
		// 			new Brackets((qb: WhereExpressionBuilder) => { 
		// 				qb.andWhere(`"${query.alias}"."tenantId" = :tenantId`, { tenantId });
		// 				qb.andWhere(`"${query.alias}"."organizationId" = :organizationId`, { organizationId });
		// 			})
		// 		);
		// 		if (conditions?.where) {
		// 			query.andWhere(conditions.where)
		// 		}
		// 		query.andWhere([
		// 			{
		// 				createdById: user.id,
		// 			},
		// 			{
		// 				businessAreaId: In(areas.map((item) => item.id)),
		// 			},
		// 		])
		// 	},
		// }
	}

	async findMy(conditions?: FindManyOptions<T>) {
		
		const condition = await this.myBusinessAreaConditions(conditions)
		const [items, total] = await this.repository.findAndCount(condition)

		return {
			total,
			items
		}
	}

	async findOwn(conditions?: FindManyOptions<T>) {
		return super.findMyAll(conditions)
	}

	public async countMy(conditions?: FindManyOptions<T>) {
		const condition = await this.myBusinessAreaConditions(conditions)
		const total = await this.repository.count(condition)

		return total
	}
}
