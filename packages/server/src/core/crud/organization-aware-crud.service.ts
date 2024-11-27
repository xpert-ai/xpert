import { DeepPartial, FindConditions, FindManyOptions, FindOneOptions, IsNull, ObjectLiteral, Repository, UpdateResult } from 'typeorm'
import { IBasePerTenantAndOrganizationEntityModel, IUser } from '@metad/contracts'
import { BadRequestException } from '@nestjs/common'
import { User } from '../../user/user.entity'
import { RequestContext } from '../context'
import { TenantOrganizationBaseEntity } from '../entities/internal'
import { ICrudService } from './icrud.service'
import { TenantAwareCrudService } from './tenant-aware-crud.service'
import { ITryRequest } from './try-request'
import { FindOptionsWhere } from './FindOptionsWhere'

/**
 * This abstract class adds tenantId and organizationId to all query filters if a user is available in the current RequestContext
 * If a user is not available in RequestContext, then it behaves exactly the same as CrudService
 */
export abstract class TenantOrganizationAwareCrudService<
		T extends TenantOrganizationBaseEntity
	>
	extends TenantAwareCrudService<T>
	implements ICrudService<T>
{
	protected constructor(protected readonly repository: Repository<T>) {
		super(repository)
	}

	protected findConditionsWithTenantByUser(
		user: User
	): FindOptionsWhere<T> {
		const organizationId = RequestContext.getOrganizationId()
		const organizationWhere = organizationId
			? {
					organization: {
						id: organizationId,
					},
			  }
			: {
				organizationId: IsNull()
			}

		return {
			tenant: {
				id: user.tenantId,
			},
			...organizationWhere,
		} as FindOptionsWhere<T>
	}

	protected findConditionsWithTenant(
		user: User,
		where?: FindConditions<T> | ObjectLiteral | FindConditions<T>[]
	): FindConditions<T> | ObjectLiteral | FindConditions<T>[] {
		const organizationId = RequestContext.getOrganizationId()

		if (Array.isArray(where)) {
			return where.map((options) => {
				options = {
					...options,
					organizationId: IsNull()
				}

				if (organizationId) {
					options = {
						...options,
						organization: {
							id: organizationId || null,
						},
					}
				}

				return {
					...options,
					tenant: {
						id: user.tenantId,
					},
				} as FindConditions<T>
			})
		}

		const organizationWhere = organizationId
			? {
					organization: {
						id: organizationId,
					},
			  }
			: {
				organizationId: IsNull()
			}

		return where
			? ({
					...where,
					tenant: {
						id: user.tenantId,
					},
					...organizationWhere,
			  } as FindConditions<T>)
			: ({
					tenant: {
						id: user.tenantId,
					},
					...organizationWhere,
			  } as ObjectLiteral)
	}

	private findConditionsWithoutOrgByUser(
		user: IUser
	): FindConditions<T>[] | FindConditions<T> | ObjectLiteral | string {
		return {
			tenant: {
				id: user.tenantId,
			},
			organizationId: IsNull()
		}
	}

	private findConditionsWithoutOrg(
		user: IUser,
		where?: FindConditions<T> | ObjectLiteral | FindConditions<T>[]
	): FindConditions<T> | ObjectLiteral | FindConditions<T>[] {
		if (Array.isArray(where)) {
			return where.map((options) => {
				options = {
					...options,
					organizationId: IsNull()
				}
				return {
					...options,
					tenant: {
						id: user.tenantId,
					},
				} as FindConditions<T>
			})
		}

		return where
			? ({
					...where,
					tenant: {
						id: user.tenantId,
					},
					organizationId: IsNull()
			  } as FindConditions<T>)
			: ({
					tenant: {
						id: user.tenantId,
					},
					organizationId: IsNull()
			  } as ObjectLiteral)
	}

	private findManyWithoutOrganization(
		filter?: FindManyOptions<T>
	): FindManyOptions<T> {

		const user = RequestContext.currentUser();
		
		if (!user || !user.tenantId) {
			return filter;
		}
		
		if (!filter) {
			return {
				where: this.findConditionsWithoutOrgByUser(user)
			};
		}
		
		if (!filter.where) {
			return {
				...filter,
				where: this.findConditionsWithoutOrgByUser(user)
			};
		}
		
		if (filter.where instanceof Object) {
			return {
				...filter,
				where: this.findConditionsWithoutOrg(user, filter.where)
			};
		}

		return filter;
	}

	async findAllWithoutOrganization(filter?: FindManyOptions<T>) {
		filter = this.findManyWithoutOrganization(filter)
		const total = await this.repository.count(filter);
		const items = await this.repository.find(filter);
		return { items, total };
	}

	private async _findOneOrFail(
		id: string | number | FindOneOptions<T> | FindConditions<T>,
		options?: FindOneOptions<T>
	): Promise<ITryRequest> {
		try {
			const record = await this.repository.findOneOrFail(
				id as string,
				options
			);
			return {
				success: true,
				record
			};
		} catch (error) {
			return {
				success: false,
				error
			};
		}
	}

	public async findOneOrFailWithoutOrg(
		id: string | number | FindOneOptions<T> | FindConditions<T>,
		options?: FindOneOptions<T>
	): Promise<ITryRequest> {
		if (typeof id === 'object') {
			const firstOptions = id as FindOneOptions<T>;
			return await this._findOneOrFail(
				this.findManyWithoutOrganization(firstOptions),
				options
			);
		}
		return await this._findOneOrFail(id, this.findManyWithoutOrganization(options));
	}

	/**
	 * Try to find T entity in organization or tenant
	 */
	async findOneInOrganizationOrTenant(id: string, options?: FindOneOptions<T>) {
		let entity: T = null
		try {
			entity = await this.findOneByIdString(id, options)
		} catch (err) {
			const result = await this.findOneOrFailWithoutOrg(id, options)
			if (result.success) {
				entity = result.record
			}
		}
		return entity
	}

	public async create(entity: DeepPartial<T>, ...options: any[]): Promise<T> {
		const tenantId = RequestContext.currentTenantId()
		const user = RequestContext.currentUser()
		const organizationId = RequestContext.getOrganizationId()

		if (organizationId) {
			entity = {
				...entity,
				organization: { id: organizationId },
			}
		}

		if (tenantId) {
			const entityWithTenant = {
				...entity,
				tenant: { id: tenantId },
			}
			return super.create(entityWithTenant, ...options)
		}
		return super.create(entity, ...options)
	}

	/**
	 * Alternatively, You can recover the soft deleted rows by using the restore() method:
	 */
	async restoreSoftDelete(id: string, options?: IBasePerTenantAndOrganizationEntityModel): Promise<UpdateResult> {
		const { organizationId } = options ?? {}
		try {
			return await this.repository.restore({
				id,
				tenantId: RequestContext.currentTenantId(),
				organizationId: organizationId ?? RequestContext.getOrganizationId()
			} as any);
		} catch (error) {
			throw new BadRequestException(error.message);
		}
	}
}
