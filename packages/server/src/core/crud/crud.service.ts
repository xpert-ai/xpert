import { ID, IPagination } from '@metad/contracts';
import { getErrorMessage } from '@metad/server-common';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
	DeepPartial,
	DeleteResult,
	FindManyOptions,
	FindOneOptions,
	FindOptionsWhere,
	Repository,
	SaveOptions,
	SelectQueryBuilder,
	UpdateResult
} from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import moment from 'moment';
import { BaseEntity } from '../entities/internal';
import { ICrudService, IFindOneOptions, IFindWhereOptions } from './icrud.service';
import { ITryRequest } from './try-request';
import { filterQuery } from './query-builder';
import { RequestContext } from '../context';
import { transformWhere } from './transform-where';
import { isForeignKeyConstraintError } from '../utils/db';

export abstract class CrudService<T extends BaseEntity>
	implements ICrudService<T> {
	/**
	 * Alias (default we used table name) for pagination crud
	 */
	protected get alias(): string {
		return this.repository.metadata.tableName;
	}

	protected constructor(
		protected readonly repository: Repository<T>
	) {}

	async findMyAll(filter?: FindManyOptions<T>): Promise<IPagination<T>> {
		throw new Error('Method not implemented.');
	}
	
	public async count(filter?: FindManyOptions<T>): Promise<number> {
		return await this.repository.count(filter);
	}

	public async countBy(filter?: FindOptionsWhere<T>): Promise<number> {
		return await this.repository.countBy(filter);
	}

	public async findAll(filter?: FindManyOptions<T>): Promise<IPagination<T>> {
		if (filter?.where) {
			filter.where = Array.isArray(filter.where) ? filter.where.map(item => transformWhere(item)) : transformWhere(filter.where);
		}
		const [items, total] = await this.repository.findAndCount(filter)
		return { items, total }
	}

	public async paginate(filter?: any): Promise<IPagination<T>> {
		try {
			const options: FindManyOptions = {};
			options.skip = filter && filter.skip ? (filter.take * (filter.skip - 1)) : 0;
			options.take = filter && filter.take ? (filter.take) : 10;
			if (filter) {
				if (filter.orderBy && filter.order) {
					options.order = {
						[filter.orderBy]: filter.order
					}
				} else if (filter.orderBy) {
					options.order = filter.orderBy;
				}
				if (filter.relations) {
					options.relations = filter.relations;
				}
				if (filter.join) {
					options.join = filter.join;
				}
			}
			options.where = (qb: SelectQueryBuilder<T>) => {
				if (filter && (filter.filters || filter.where)) {
					if (filter.where) {
						const wheres: any = {}
						for (const field in filter.where) {
							if (Object.prototype.hasOwnProperty.call(filter.where, field)) {
								wheres[field] = filter.where[field];
							}
						}
						filterQuery(qb, wheres);
					}
				}
				const tenantId = RequestContext.currentTenantId();
				qb.andWhere(`"${qb.alias}"."tenantId" = :tenantId`, { tenantId });
				console.log(qb.getQueryAndParameters(), moment().format('DD.MM.YYYY HH:mm:ss'));
			}
			console.log(filter, moment().format('DD.MM.YYYY HH:mm:ss'));
			const [items, total] = await this.repository.findAndCount(options);
			return { items, total };
		} catch (error) {
			throw new BadRequestException(error);
		}
	}

	/*
	|--------------------------------------------------------------------------
	| @FindOneOrFail
	|--------------------------------------------------------------------------
	*/

	/**
	 * @internal
	 */
	protected async _findOneOrFailByIdString(id: string, options?: IFindOneOptions<T>): Promise<ITryRequest<T>> {
		try {
			options = options as FindOneOptions<T>;
			const record = await this.repository.findOneOrFail({
				where: {
					id,
					...(options && options.where ? options.where : {})
				},
				...(options && options.select ? { select: options.select } : {}),
				...(options && options.relations ? { relations: options.relations } : []),
				...(options && options.order ? { order: options.order } : {})
			} as FindOneOptions<T>);
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

	/**
	 * Finds first entity by a given find options.
	 * If entity was not found in the database - rejects with error.
	 *
	 * @param id
	 * @param options
	 * @returns
	 */
	public async findOneOrFailByIdString(id: string, options?: IFindOneOptions<T>): Promise<ITryRequest<T>> {
		return this._findOneOrFailByIdString(id, options);
	}

	/**
	 * @internal
	 */
	protected async _findOneOrFailByOptions(options: IFindOneOptions<T>): Promise<ITryRequest<T>> {
		try {
			const record = await this.repository.findOneOrFail(options as FindOneOptions<T>);
			return {
				success: true,
				record: record
			};
		} catch (error) {
			return {
				success: false,
				error
			};
		}
	}

	/**
	 * Finds first entity by a given find options.
	 * If entity was not found in the database - rejects with error.
	 *
	 * @param options
	 * @returns
	 */
	public async findOneOrFailByOptions(options: IFindOneOptions<T>): Promise<ITryRequest<T>> {
		return this._findOneOrFailByOptions(options);
	}

	// /**
	//  * @deprecated use `findOneOrFailByIdString` or `findOneOrFailByOptions` or `findOneOrFailByWhereOptions` instead
	//  */
	// public async findOneOrFail(
	// 	id: string | number | FindOneOptions<T>,
	// 	options?: FindOneOptions<T>
	// ): Promise<ITryRequest> {
	// 	let _options: FindOneOptions<T> = options ?? {}
	// 	if (typeof id === 'string' || typeof id === 'number') {
	// 		_options = {
	// 					where: {
	// 						id,
	// 						...(options && options.where ? options.where : {})
	// 					},
	// 					...(options && options.select ? { select: options.select } : {}),
	// 					...(options && options.relations ? { relations: options.relations } : []),
	// 					...(options && options.order ? { order: options.order } : {})
	// 				} as FindOneOptions<T>
	// 	} else {
	// 		_options = id as FindOneOptions<T>
	// 	}
	// 	try {
	// 		const record = await this.repository.findOneOrFail(_options);
	// 		return {
	// 			success: true,
	// 			record
	// 		};
	// 	} catch (error) {
	// 		return {
	// 			success: false,
	// 			error
	// 		};
	// 	}
	// }

	/**
	 * Finds first entity that matches given where condition.
	 * If entity was not found in the database - rejects with error.
	 *
	 * @param options
	 * @returns
	 */
	public async findOneOrFailByWhereOptions(options: IFindWhereOptions<T>): Promise<ITryRequest<T>> {
		try {
			const record = await this.repository.findOneByOrFail(options);

			return {
				success: true,
				record: record
			};
		} catch (error) {
			return {
				success: false,
				error
			};
		}
	}

	/*
	|--------------------------------------------------------------------------
	| @FindOne
	|--------------------------------------------------------------------------
	*/
	/**
	 * Finds first entity by a given find options.
	 * If entity was not found in the database - returns null.
	 *
	 * @param id {string}
	 * @param options
	 * @returns
	 */
	public async findOneByIdString(id: ID, options?: IFindOneOptions<T>): Promise<T> {
		const record = await this.repository.findOne({
					where: {
						id,
						...(options && options.where ? options.where : {})
					},
					...(options && options.select ? { select: options.select } : {}),
					...(options && options.relations ? { relations: options.relations } : []),
					...(options && options.order ? { order: options.order } : {}),
					...(options && options.withDeleted ? { withDeleted: options.withDeleted } : {})
				} as FindOneOptions<T>);
		if (!record) {
			throw new NotFoundException(`The requested record was not found`);
		}
		return record
	}

	public async findOne(
		id: string | number | FindOneOptions<T>,
		options?: FindOneOptions<T>
	): Promise<T> {
		let _options: FindOneOptions<T> = options ?? {}
		if (typeof id === 'string' || typeof id === 'number') {
			_options = {
						where: {
							id,
							...(options && options.where ? options.where : {})
						},
						...(options && options.select ? { select: options.select } : {}),
						...(options && options.relations ? { relations: options.relations } : []),
						...(options && options.order ? { order: options.order } : {})
					} as FindOneOptions<T>
		} else {
			_options = id as FindOneOptions<T>
		}
		const record = await this.repository.findOne(_options);
		if (!record) {
			throw new NotFoundException(`The requested record was not found`);
		}
		return record;
	}

	/**
	 * Finds first entity that matches given options.
	 *
	 * @param options
	 * @returns
	 */
	public async findOneByOptions(
		options: FindOneOptions<T>
	): Promise<T> {
		const record = await this.repository.findOne(
			options
		);
		if (!record) {
			throw new NotFoundException(`The requested record was not found`);
		}
		return record;
	}

	/**
	 * Finds first entity that matches given where condition.
	 * If entity was not found in the database - returns null.
	 *
	 * @param options
	 * @returns
	 */
	public async findOneByWhereOptions(options: IFindWhereOptions<T>): Promise<T | null> {
		const record: T = await this.repository.findOneBy(options as FindOptionsWhere<T>)

		if (!record) {
			throw new NotFoundException(`The requested record was not found`);
		}
		return record
	}
	

	public async create(entity: DeepPartial<T>, ...options: any[]): Promise<T> {
		const obj = this.repository.create(entity);
		// createBy user
		const userId = RequestContext.currentUserId()
		if (userId) {
			// obj.createdById = userId
			if (!entity.createdById) {
				obj.createdBy = {
					id: userId
				}
			}

			obj.updatedBy = {
				id: userId
			}
		}
		
		try {
			// https://github.com/Microsoft/TypeScript/issues/21592
			return await this.repository.save(obj as any);
		} catch (err /*: WriteError*/) {
			throw new BadRequestException(err);
		}
	}

	protected async checkUpdateAuthorization(id: string | number | FindOptionsWhere<T>) {
		//
	}

	public async update(
		id: string | number | FindOptionsWhere<T>,
		partialEntity: QueryDeepPartialEntity<T>,
		...options: any[]
	): Promise<UpdateResult | T> {
		/**
		 * @todo 是不是应该用 切片 注解的方式处理权限检查问题 ?
		 */
		await this.checkUpdateAuthorization(id)
		const userId = RequestContext.currentUserId()
		try {
			// try if can import somehow the service and use its method
			if (typeof id === 'string') {
				partialEntity = {
					...partialEntity,
					// Ensure entity id in typeorm `UpdateEvent`
					id,
				}
			}
			return await this.repository.update(id, {
				...partialEntity,
				updatedById: userId ?? (partialEntity as any).updatedById
			});
		} catch (err /*: WriteError*/) {
			throw new BadRequestException(getErrorMessage(err));
		}
	}

	/**
	 * Deletes a record based on the given criteria.
	 * Criteria can be an ID (string or number) or a complex object with conditions.
	 *
	 * @param criteria - Identifier or condition to delete specific record(s).
	 * @returns {Promise<DeleteResult>} - Result indicating the number of affected records.
	 */
	public async delete(
		criteria: string | number | FindOptionsWhere<T>
	): Promise<DeleteResult> {
		await this.checkUpdateAuthorization(criteria)
		try {
			return await this.repository.delete(criteria);
		} catch (err) {
			if (isForeignKeyConstraintError(err)) {
				throw new BadRequestException('Cannot delete: record is still referenced by another table.');
			}
			console.error(err);
			throw new NotFoundException(`The record was not found`, err);
		}
	}

	/**
	 * Softly deletes entities by a given criteria.
	 * This method sets a flag or timestamp indicating the entity is considered deleted.
	 * It does not actually remove the entity from the database, allowing for recovery or audit purposes.
	 *
	 * @param criteria - Entity ID or condition to identify which entities to soft-delete.
	 * @param options - Additional options for the operation.
	 * @returns {Promise<UpdateResult | DeleteResult>} - Result indicating success or failure.
	 */
	public async softDelete(
		criteria: string | number | FindOptionsWhere<T>
	): Promise<UpdateResult | T> {
		try {
			// Perform soft delete using TypeORM
			return await this.repository.softDelete(criteria)
		} catch (error) {
			if (isForeignKeyConstraintError(error)) {
				throw new BadRequestException('Cannot delete: record is still referenced by another table.');
			}
			throw new NotFoundException(`The record was not found or could not be soft-deleted`, error);
		}
	}

	/**
	 * Softly removes an entity from the database.
	 *
	 * @param id - The unique identifier of the entity to be softly removed.
	 * @param options - Optional parameters for finding the entity
	 * @param saveOptions - Additional save options for the ORM operation
	 * @returns A promise that resolves to the softly removed entity.
	 */
	public async softRemove(id: T['id'], options?: FindOneOptions<T>, saveOptions?: SaveOptions): Promise<T> {
		try {
			// Ensure the employee exists before attempting soft deletion
			const entity = await this.findOneByIdString(id, options);
			// TypeORM soft removes entities via its repository
			return await this.repository.softRemove<DeepPartial<T>>(entity as DeepPartial<T>, saveOptions);
		} catch (error) {
			// If any error occurs, rethrow it as a NotFoundException with additional context.
			throw new NotFoundException(`An error occurred during soft removal: ${error.message}`, error);
		}
	}

	/**
	 * Soft-recover a previously soft-deleted entity.
	 *
	 * Depending on the ORM, this method restores a soft-deleted entity by resetting its deletion indicator.
	 *
	 * @param entity - The soft-deleted entity to recover.
	 * @param options - Optional settings for database save operations.
	 * @returns A promise that resolves with the recovered entity.
	 */
	public async softRecover(id: T['id'], options?: FindOneOptions<T>, saveOptions?: SaveOptions): Promise<T> {
		try {
			// Ensure the entity exists before attempting soft recover
			const entity = await this.findOneByIdString(id, options);
			// Use TypeORM's recover method to restore the entity
			return await this.repository.recover(entity as DeepPartial<T>, saveOptions);
		} catch (error) {
			// If any error occurs, rethrow it as a NotFoundException with additional context.
			throw new NotFoundException(`An error occurred during restoring entity: ${error.message}`);
		}
	}
}
