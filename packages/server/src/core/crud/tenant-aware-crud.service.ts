import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
	DeepPartial,
	DeleteResult,
	FindConditions,
	FindManyOptions,
	FindOneOptions,
	ObjectLiteral,
	Repository,
	UpdateResult
} from 'typeorm';
import { IBasePerTenantEntityModel, IPagination, IUser } from '@metad/contracts';
import { RequestContext } from '../context';
import { TenantBaseEntity, User } from '../entities/internal';
import { CrudService } from './crud.service';
import { ICrudService } from './icrud.service';
import { ITryRequest } from './try-request';
import { FindOptionsWhere } from './FindOptionsWhere';

/**
 * This abstract class adds tenantId to all query filters if a user is available in the current RequestContext
 * If a user is not available in RequestContext, then it behaves exactly the same as CrudService
 */
export abstract class TenantAwareCrudService<T extends TenantBaseEntity>
	extends CrudService<T>
	implements ICrudService<T> {
	protected constructor(
		protected readonly repository: Repository<T>,
		
	) {
		super(repository);
	}

	protected findConditionsWithTenantByUser(
		user: IUser		
	): FindOptionsWhere<T> {		
		return {
					tenant: {
						id: user.tenantId
					}
			  } as FindOptionsWhere<T>;
	}

	protected findConditionsWithTenant(
		user: User,
		where?: FindConditions<T>[] | FindConditions<T> | ObjectLiteral
	): FindConditions<T>[] | FindConditions<T> | ObjectLiteral {

		
		if (where && Array.isArray(where)) {
			const wheres: FindConditions<T>[] = [];
			// where.forEach((options: FindConditions<T>) => {
			for (const options of where) {
				wheres.push({
					...options,
					tenant: {
						id: user.tenantId
					}
				})
			}
			return wheres;
		}
		

		return where
			? ({
				...where,
				tenant: {
					id: user.tenantId
				}
			  } as any)
			: ({
				tenant: {
					id: user.tenantId
				}
			  } as any)
	}

	protected findOneWithTenant(
		filter?: FindOneOptions<T>
	): FindOneOptions<T> {

		const user = RequestContext.currentUser();
		
		if (!user || !user.tenantId) {
			return filter;
		}
		
		if (!filter) {
			return {
				where: this.findConditionsWithTenantByUser(user)
			};
		}
		
		if (!filter.where) {
			return {
				...filter,
				where: this.findConditionsWithTenantByUser(user)
			};
		}
		
		if (filter.where instanceof Object) {
			return {
				...filter,
				where: this.findConditionsWithTenant(user as User, filter.where)
			};
		}

		return filter;
	}

	private findManyWithTenant(
		filter?: FindManyOptions<T>
	): FindManyOptions<T> {

		const user = RequestContext.currentUser();
		
		if (!user || !user.tenantId) {
			return filter;
		}
		
		if (!filter) {
			return {
				where: this.findConditionsWithTenantByUser(user)
			};
		}
		
		if (!filter.where) {
			return {
				...filter,
				where: this.findConditionsWithTenantByUser(user)
			};
		}
		
		if (filter.where instanceof Object) {
			return {
				...filter,
				where: this.findConditionsWithTenant(user as User, filter.where)
			};
		}

		return filter;
	}

	public async count(filter?: FindManyOptions<T>): Promise<number> {
		return await super.count(this.findManyWithTenant(filter));
	}

	public async findAll(filter?: FindManyOptions<T>): Promise<IPagination<T>> {
		return await super.findAll(this.findManyWithTenant(filter));
	}

	public async findOneOrFail(
		id: string | number | FindOneOptions<T> | FindConditions<T>,
		options?: FindOneOptions<T>
	): Promise<ITryRequest<T>> {
		if (typeof id === 'object') {
			const firstOptions = id as FindOneOptions<T>;
			return await super.findOneOrFail(
				this.findManyWithTenant(firstOptions),
				options
			);
		}
		return await super.findOneOrFail(id, this.findManyWithTenant(options));
	}

	public async findOne(
		id: string | number | FindOneOptions<T> | FindConditions<T>,
		options?: FindOneOptions<T>
	): Promise<T> {
		if (typeof id === 'object') {
			const firstOptions = id as FindOneOptions<T>;
			return await super.findOne(
				this.findManyWithTenant(firstOptions),
				options
			);
		}

		return await super.findOne(id, this.findManyWithTenant(options));
	}

	/**
	 * Finds first entity that matches given id and options with current tenant.
	 *
	 * @param id {string}
	 * @param options
	 * @returns
	 */
	public async findOneByIdString(
		id: string,
		options?: FindOneOptions<T>
	): Promise<T> {
		return await super.findOneByIdString(
			id,
			this.findOneWithTenant(options)
		);
	}

	/**
	 * Finds first entity that matches given conditions and options with current tenant.
	 *
	 * @param id
	 * @param options
	 * @returns
	 */
	public async findOneByConditions(
		id: FindConditions<T>,
		options?: FindOneOptions<T>
	): Promise<T> {
		return await super.findOneByConditions(
			id,
			this.findOneWithTenant(options)
		);
	}

	/**
	 * Finds first entity that matches given options with current tenant.
	 *
	 * @param options
	 * @returns
	 */
	public async findOneByOptions(
		options: FindOneOptions<T>
	): Promise<T> {
		return await super.findOneByOptions(
			this.findOneWithTenant(options)
		);
	}

	/**
	 * Finds first entity that matches given where condition with current tenant.
	 * If entity was not found in the database - returns null.
	 *
	 * @param options
	 * @returns
	 */
	public async findOneByWhereOptions(options: FindOptionsWhere<T>): Promise<T> {
		const user = RequestContext.currentUser();
		return await super.findOneByWhereOptions({
			...options,
			...this.findConditionsWithTenantByUser(user)
		});
	}

	public async create(entity: DeepPartial<T>, ...options: any[]): Promise<T> {
		const tenantId = RequestContext.currentTenantId();
		if (tenantId) {
			const entityWithTenant = {
				...entity,
				tenant: { id: tenantId }
			};
			return super.create(entityWithTenant, ...options);
		}
		return super.create(entity, ...options);
	}

	/**
	 * DELETE source related to tenant
	 * 
	 * @param criteria 
	 * @param options 
	 * @returns 
	 */
	public async delete(
		criteria: string | number | FindConditions<T>,
		options?: FindOneOptions<T>
	): Promise<DeleteResult> {
		try {
			const record = await this.findOne(criteria, options);
			if (!record) {
				throw new NotFoundException(`The requested record was not found`);
			}
			return await super.delete(criteria);
		} catch (err) {
			throw new NotFoundException(`The record was not found`, err);
		}
	}

	public async findMyAll(filter?: FindManyOptions<T>): Promise<IPagination<T>> {
		const user = RequestContext.currentUser();
		filter = filter || {}
		if (user) {
			filter = {
				...filter,
				where: this.findConditionsWithUser(user, filter.where)
			}
		}
		return await super.findAll(this.findManyWithTenant(filter));
	}

	protected findConditionsWithUser(
		user: IUser,
		where?: FindManyOptions['where'] // FindConditions<T> | ObjectLiteral | FindConditions<T>[]
	): FindManyOptions['where'] {

		if (Array.isArray(where)) {
			return where.map((options) => ({
				...options,
				createdBy: {
					id: user.id
				}
			}))
		}

		if (typeof where === 'string') {
			return where
		}
		return where
			? {
				...where,
				createdBy: {
					id: user.id
				}
			  }
			: {
				createdBy: {
					id: user.id
				}
			  }
	}

	/**
	 * Softly deletes entities by a given criteria.
	 * This method sets a flag or timestamp indicating the entity is considered deleted.
	 * It does not actually remove the entity from the database, allowing for recovery or audit purposes.
	 *
	 * @param criteria - Entity ID or complex query to identify which entity to soft-delete.
	 * @param options - Additional options for the operation.
	 * @returns {Promise<DeleteResult>} - Result indicating success or failure.
	 */
	public async softDelete(
		criteria: string | number | FindOptionsWhere<T>,
		options?: FindOneOptions<T>
	): Promise<UpdateResult | T> {
		try {
			let record: T | null;

			// If the criteria is a string, assume it's an ID and find the record by ID.
			if (typeof criteria === 'string') {
				record = await this.findOneByIdString(criteria, options);
			} else {
				// Otherwise, consider it a more complex query and find the record by those options.
				record = await this.findOneByWhereOptions(criteria as FindOptionsWhere<T>);
			}

			// If no record is found, throw a NotFoundException.
			if (!record) {
				throw new NotFoundException(`The requested record was not found`);
			}

			// Proceed with the soft-delete operation from the superclass.
			return await this.repository.softDelete(criteria);
		} catch (err) {
			// If any error occurs, rethrow it as a NotFoundException with additional context.
			throw new NotFoundException(`The record was not found or could not be soft-deleted`, err);
		}
	}

	/**
	 * Alternatively, You can recover the soft deleted rows by using the restore() method:
	 */
	async restoreSoftDelete(id: string, options?: IBasePerTenantEntityModel): Promise<UpdateResult> {
		try {
			return await this.repository.restore({
				id,
				tenantId: RequestContext.currentTenantId()
			} as any);
		} catch (error) {
			throw new BadRequestException(error);
		}
	}
}
