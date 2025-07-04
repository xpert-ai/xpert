export interface IPaginationInput {
	limit?: number;
	page?: number;
}

/**
* Generic pagination interface
*/
export interface IPagination<T> {
	/**
	 * Items included in the current listing
	 */
	readonly items: T[];

	/**
	 * Total number of available items
	 */
	readonly total: number;
}

/*
* Common query parameter
*/
export interface IListQueryInput<T> {
	/**
	 * Model entity defined relations
	 */
	readonly relations?: string[];
	readonly findInput?: T | any;
	readonly where?: any;
}

export enum OrderTypeEnum {
	DESC = 'DESC',
	ASC = 'ASC'
}

export type JSONValue =
  | null
  | string
  | number
  | boolean
  | {
      [x: string]: JSONValue
    }
  | Array<JSONValue>

export type WhereOperator<T> =
  | { $eq?: T }
  | { $ne?: T }
  | { $in?: T[] }
  | { $notIn?: T[] }
  | { $like?: string }
  | { $ilike?: string }
  | { $gt?: T }
  | { $gte?: T }
  | { $lt?: T }
  | { $lte?: T }
  | { $isNull?: boolean }

export type SmartWhere<T> = Partial<{
  [P in keyof T]?: T[P] | WhereOperator<T[P]>
}>

export type PaginationParams<T> = {
  select?: (keyof T)[]
  take?: number
  skip?: number
  where?: SmartWhere<T>
  relations?: string[]
  order?: Partial<{ [P in keyof T]: OrderTypeEnum }>
}
