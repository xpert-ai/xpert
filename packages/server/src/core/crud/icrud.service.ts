import {
	DeepPartial,
	DeleteResult,
	FindConditions,
	FindManyOptions,
	FindOneOptions,
	UpdateResult
} from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { IPagination } from '@metad/contracts';
import { FindOptionsWhere } from './FindOptionsWhere';

export interface ICrudService<T> {
	count(filter?: FindManyOptions<T>): Promise<number>;
	findAll(filter?: FindManyOptions<T>): Promise<IPagination<T>>;
	findMyAll(filter?: FindManyOptions<T>): Promise<IPagination<T>>;
	paginate(filter?: FindManyOptions<T>): Promise<IPagination<T>>;
	findOne(
		id: string | number | FindOneOptions<T> | FindConditions<T>,
		options?: FindOneOptions<T>
	): Promise<T>;
	create(entity: DeepPartial<T>, ...options: any[]): Promise<T>;
	update(
		id: any,
		entity: QueryDeepPartialEntity<T>,
		...options: any[]
	): Promise<UpdateResult | T>;
	delete(id: any, ...options: any[]): Promise<DeleteResult>;
	softDelete(id: IDeleteCriteria<T>, ...options: any[]): Promise<UpdateResult | T>;
	softRemove(id: string, ...options: any[]): Promise<T>;
	softRecover(id: string, ...options: any[]): Promise<T>;
}

export type IDeleteCriteria<T> = string | number | FindOptionsWhere<T>