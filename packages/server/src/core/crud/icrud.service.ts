import { IPagination } from '@metad/contracts';
import {
	DeepPartial,
	DeleteResult,
	FindManyOptions,
	FindOneOptions,
	UpdateResult,
	FindOptionsWhere
} from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { ITryRequest } from './try-request';

export interface ICrudService<T> {
	count(filter?: FindManyOptions<T>): Promise<number>;
	countBy(filter?: FindOptionsWhere<T>): Promise<number>;
	findAll(filter?: FindManyOptions<T>): Promise<IPagination<T>>;
	findMyAll(filter?: FindManyOptions<T>): Promise<IPagination<T>>;
	paginate(filter?: FindManyOptions<T>): Promise<IPagination<T>>;
	findOneByIdString(id: string, options?: IFindOneOptions<T>): Promise<T>;
	findOneOrFailByIdString(id: string, options?: IFindOneOptions<T>): Promise<ITryRequest<T>>;
	findOneByOptions(options: IFindOneOptions<T>): Promise<T>;
	findOneByWhereOptions(options: IFindWhereOptions<T>): Promise<T>;
	findOneOrFailByOptions(options: IFindOneOptions<T>): Promise<ITryRequest<T>>;
	findOneOrFailByWhereOptions(options: IFindWhereOptions<T>): Promise<ITryRequest<T>>;
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
export type IFindOneOptions<T> = FindOneOptions<T>
export type IFindWhereOptions<T> = FindOptionsWhere<T>