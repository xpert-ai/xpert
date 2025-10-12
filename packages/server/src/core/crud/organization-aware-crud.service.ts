import { DeepPartial, FindManyOptions, FindOneOptions, IsNull, Repository, UpdateResult } from 'typeorm'
import { IBasePerTenantAndOrganizationEntityModel, ID, IUser } from '@metad/contracts'
import { BadRequestException } from '@nestjs/common'
import { RequestContext } from '../context'
import { TenantOrganizationBaseEntity, User } from '../entities/internal'
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
		return {
			tenantId: user.tenantId,
			organizationId: organizationId || IsNull(),
		} as FindOptionsWhere<T>
	}

	protected findConditionsWithTenant(
		user: User,
		where?: FindOptionsWhere<T> | FindOptionsWhere<T>[]
	): FindOptionsWhere<T> | FindOptionsWhere<T>[] {
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
						organizationId: organizationId || null,
					}
				}

				return {
					...options,
					tenantId: user.tenantId,
				} as FindOptionsWhere<T>
			})
		}

		const organizationWhere = organizationId
			? {
					organizationId
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
			  } as FindOptionsWhere<T>)
			: ({
					tenant: {
						id: user.tenantId,
					},
					...organizationWhere,
			  } as FindOptionsWhere<T>)
	}

	private findConditionsWithoutOrgByUser(
		user: IUser
	): FindOptionsWhere<T>[] | FindOptionsWhere<T> {
		return {
			tenant: {
				id: user.tenantId,
			},
			organizationId: IsNull()
		} as FindOptionsWhere<T>
	}

	private findConditionsWithoutOrg(
		user: IUser,
		where?: FindOptionsWhere<T> | FindOptionsWhere<T>[]
	): FindOptionsWhere<T> | FindOptionsWhere<T>[] {
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
				} as FindOptionsWhere<T>
			})
		}

		return where
			? ({
					...where,
					tenant: {
						id: user.tenantId,
					},
					organizationId: IsNull()
			  } as FindOptionsWhere<T>)
			: ({
					tenant: {
						id: user.tenantId,
					},
					organizationId: IsNull()
			  } as FindOptionsWhere<T>)
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

	/*
	|--------------------------------------------------------------------------
	| @WithoutOrganization
	|--------------------------------------------------------------------------
	*/

	async findAllWithoutOrganization(filter?: FindManyOptions<T>) {
		filter = this.findManyWithoutOrganization(filter)
		const total = await this.repository.count(filter);
		const items = await this.repository.find(filter);
		return { items, total };
	}

	/**
	 * @internal
	 */
	public async findOneOrFailWithoutOrg(
		id: ID | FindOneOptions<T> | FindOptionsWhere<T>,
		options?: FindOneOptions<T>
	): Promise<ITryRequest> {
		if (typeof id === 'object') {
			const firstOptions = id as FindOneOptions<T>;
			return await this._findOneOrFailByOptions(
				this.findManyWithoutOrganization(firstOptions),
			);
		}
		return await this._findOneOrFailByIdString(id, this.findManyWithoutOrganization(options));
	}

	/*
	|--------------------------------------------------------------------------
	| @OrganizationOrTenant
	|--------------------------------------------------------------------------
	*/

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

	async findAllInOrganizationOrTenant(options?: FindManyOptions<T>) {
		// In organization
		const orgResults = RequestContext.getOrganizationId() ? await this.findAll(options) : {
			total: 0,
			items: []
		}
		const tenantResults = await this.findAllWithoutOrganization(options)

		return {
			total: orgResults.total + tenantResults.total,
			items: [...orgResults.items, ...tenantResults.items]
		}
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
