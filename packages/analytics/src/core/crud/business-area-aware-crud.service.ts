import { BusinessAreaRole } from '@metad/contracts'
import {
	RequestContext,
	TenantOrganizationAwareCrudService,
	TenantOrganizationBaseEntity,
} from '@metad/server-core'
import { CommandBus } from '@nestjs/cqrs'
import {
	Brackets,
	FindManyOptions,
	In,
	Repository,
	SelectQueryBuilder,
	WhereExpressionBuilder,
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
	async myBusinessAreaConditions(conditions?: FindManyOptions<T>, role?: BusinessAreaRole) {
		const user = RequestContext.currentUser()
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()

		const areas = await this.commandBus.execute<BusinessAreaMyCommand, BusinessArea[]>(new BusinessAreaMyCommand(user, role))

		return {
			...(conditions ?? {}),
			where: (query: SelectQueryBuilder<T>) => {
				query.andWhere(
					new Brackets((qb: WhereExpressionBuilder) => { 
						qb.andWhere(`"${query.alias}"."tenantId" = :tenantId`, { tenantId });
						qb.andWhere(`"${query.alias}"."organizationId" = :organizationId`, { organizationId });
					})
				);
				if (conditions?.where) {
					query.andWhere(conditions.where)
				}
				query.andWhere([
					{
						createdById: user.id,
					},
					{
						businessAreaId: In(areas.map((item) => item.id)),
					},
				])
			},
		}
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
