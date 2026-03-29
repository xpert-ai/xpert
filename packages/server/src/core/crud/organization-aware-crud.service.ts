import { DeepPartial, FindManyOptions, FindOneOptions, IsNull, Repository, UpdateResult } from 'typeorm'
import { IBasePerTenantAndOrganizationEntityModel, ID, IUser } from '@metad/contracts'
import { BadRequestException } from '@nestjs/common'
import { RequestContext } from '../context'
import { TenantOrganizationBaseEntity, User } from '../entities/internal'
import { ICrudService, IPartialEntity } from './icrud.service'
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

	protected getCurrentScopeOrganizationCondition() {
		return RequestContext.getOrganizationId() ?? IsNull()
	}

	protected getTenantScopeOrganizationCondition() {
		return IsNull()
	}

	protected writeToCurrentScope(entity: DeepPartial<T>): DeepPartial<T> {
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()

		return {
			...entity,
			...(tenantId
				? {
						tenant: { id: tenantId } as any,
						tenantId
					}
				: {}),
			organization: organizationId ? ({ id: organizationId } as any) : null,
			organizationId: organizationId ?? null
		}
	}

	private mergeScopeWhere(
		user: IUser,
		organizationId: string | ReturnType<typeof IsNull>,
		where?: FindOptionsWhere<T>
	): FindOptionsWhere<T> {
		return {
			...(where ?? {}),
			tenant: {
				id: user.tenantId
			},
			organizationId
		} as FindOptionsWhere<T>
	}

	private normalizeWhere(
		user: IUser,
		organizationId: string | ReturnType<typeof IsNull>,
		where?: FindOptionsWhere<T> | FindOptionsWhere<T>[]
	): FindOptionsWhere<T> | FindOptionsWhere<T>[] {
		if (Array.isArray(where)) {
			return where.map((item) =>
				this.mergeScopeWhere(user, organizationId, item)
			)
		}

		return this.mergeScopeWhere(user, organizationId, where)
	}

	private asWhereArray(
		where: FindOptionsWhere<T> | FindOptionsWhere<T>[]
	): FindOptionsWhere<T>[] {
		return Array.isArray(where) ? where : [where]
	}

	protected findConditionsWithTenantByUser(
		user: User
	): FindOptionsWhere<T> {
		return {
			tenantId: user?.tenantId,
			organizationId: this.getCurrentScopeOrganizationCondition(),
		} as FindOptionsWhere<T>
	}

	protected findConditionsWithTenant(
		user: User,
		where?: FindOptionsWhere<T> | FindOptionsWhere<T>[]
	): FindOptionsWhere<T> | FindOptionsWhere<T>[] {
		return this.normalizeWhere(
			user,
			this.getCurrentScopeOrganizationCondition(),
			where
		)
	}

	private findConditionsWithoutOrgByUser(
		user: IUser
	): FindOptionsWhere<T>[] | FindOptionsWhere<T> {
		return {
			tenant: {
				id: user.tenantId,
			},
			organizationId: this.getTenantScopeOrganizationCondition()
		} as FindOptionsWhere<T>
	}

	private findConditionsWithoutOrg(
		user: IUser,
		where?: FindOptionsWhere<T> | FindOptionsWhere<T>[]
	): FindOptionsWhere<T> | FindOptionsWhere<T>[] {
		return this.normalizeWhere(
			user,
			this.getTenantScopeOrganizationCondition(),
			where
		)
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

	private findManyWithInheritance(
		filter?: FindManyOptions<T>
	): FindManyOptions<T> {
		const user = RequestContext.currentUser()

		if (!user || !user.tenantId) {
			return filter
		}

		const where = filter?.where
		const tenantWhere = this.asWhereArray(
			this.findConditionsWithoutOrg(user, where)
		)

		if (!RequestContext.isOrganizationScope()) {
			return {
				...(filter ?? {}),
				where: tenantWhere
			}
		}

		const organizationWhere = this.asWhereArray(
			this.findConditionsWithTenant(user as User, where)
		)

		return {
			...(filter ?? {}),
			where: [...organizationWhere, ...tenantWhere]
		}
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

	async findInCurrentScope(filter?: FindManyOptions<T>) {
		return this.findAll(filter)
	}

	async findWithInheritance(filter?: FindManyOptions<T>) {
		filter = this.findManyWithInheritance(filter)
		const total = await this.repository.count(filter)
		const items = await this.repository.find(filter)
		return { items, total }
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
		return this.findWithInheritance(options)
	}

	public async create(entity: DeepPartial<T>, ...options: any[]): Promise<T> {
		return super.create(this.writeToCurrentScope(entity), ...options)
	}

	public async save(entity: IPartialEntity<T>): Promise<T> {
		return super.save(this.writeToCurrentScope(entity) as IPartialEntity<T>)
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
