import {
  IsNull,
  Not,
  In,
  Like,
  ILike,
  MoreThan,
  MoreThanOrEqual,
  LessThan,
  LessThanOrEqual,
  SelectQueryBuilder,
  Raw
} from 'typeorm'
import { FindOptionsWhere } from './FindOptionsWhere'

export type OperatorValue =
  | { $eq?: any }
  | { $ne?: any }
  | { $in?: any[] }
  | { $notIn?: any[] }
  | { $like?: string }
  | { $ilike?: string }
  | { $gt?: any }
  | { $gte?: any }
  | { $lt?: any }
  | { $lte?: any }
  | { $isNull?: boolean }
  | { $contains?: any[] }

/**
 * Supported operators:
  | Operator  | Meaning                              | TypeORM conversion           |
  | --------- | ------------------------------------ | ---------------------------- |
  | `$isNull` | Is it null                           | `IsNull()` / `Not(IsNull())` |
  | `$in`     | Value is in the list                 | `In([...])`                  |
  | `$notIn`  | Value is not in the list             | `Not(In([...]))`             |
  | `$like`   | Fuzzy matching                       | `Like('%xxx%')`              |
  | `$ilike`  | Case-insensitive matching (Postgres) | `ILike('%xxx%')`             |
  | `$eq`     | Equal to                             | `value`                      |
  | `$ne`     | Not equal to                         | `Not(value)`                 |
  | `$gt`     | Greater than                         | `MoreThan(value)`            |
  | `$gte`    | Greater than or equal to             | `MoreThanOrEqual(value)`     |
  | `$lt`     | Less than                            | `LessThan(value)`            |
  | `$lte`    | Less than or equal to                | `LessThanOrEqual(value)`     |
  | `$contains`| Array contains                      | `Raw(...)`                   |
 * @param where 
 * @returns 
 */
export function transformWhere<T = any>(where: Record<string, OperatorValue> | null): FindOptionsWhere<T> | null {
  if (!where) return null
  
  const result: Record<string, any> = {}

  for (const key in where) {
    const value = where[key]

    // Simple value, direct assignment
    if (typeof value !== 'object' || value === null) {
      result[key] = value
      continue
    }

    // Special syntax processing
    if ('$isNull' in value) {
      result[key] = value.$isNull ? IsNull() : Not(IsNull())
    } else if ('$in' in value) {
      result[key] = In(value.$in)
    } else if ('$notIn' in value) {
      result[key] = Not(In(value.$notIn))
    } else if ('$like' in value) {
      result[key] = Like(value.$like)
    } else if ('$ilike' in value) {
      result[key] = ILike(value.$ilike)
    } else if ('$eq' in value) {
      result[key] = value.$eq
    } else if ('$ne' in value) {
      result[key] = Not(value.$ne)
    } else if ('$gt' in value) {
      result[key] = MoreThan(value.$gt)
    } else if ('$gte' in value) {
      result[key] = MoreThanOrEqual(value.$gte)
    } else if ('$lt' in value) {
      result[key] = LessThan(value.$lt)
    } else if ('$lte' in value) {
      result[key] = LessThanOrEqual(value.$lte)
    } else if ('$contains' in value) {
      result[key] = Raw((alias) => `${alias} @> :contains`, { contains: JSON.stringify(value.$contains) })
    } else {
      // fallback: directly as a sub-condition
      result[key] = value
    }
  }

  return result as FindOptionsWhere<T>
}


type WhereInput = Record<string, any>

export function applyWhereToQueryBuilder<T>(
  qb: SelectQueryBuilder<T>,
  alias: string,
  where: WhereInput
): SelectQueryBuilder<T> {
  if (!where) return qb

  Object.entries(where).forEach(([key, value], index) => {
    const paramKey = `${key}_${index}` // Preventing duplicate naming
    const fieldPath = `${alias}.${key}`

    if (typeof value !== 'object' || value === null) {
      qb.andWhere(`${fieldPath} = :${paramKey}`, { [paramKey]: value })
    } else if ('$isNull' in value) {
      if (value.$isNull) {
        qb.andWhere(`${fieldPath} IS NULL`)
      } else {
        qb.andWhere(`${fieldPath} IS NOT NULL`)
      }
    } else if ('$like' in value) {
      qb.andWhere(`${fieldPath} LIKE :${paramKey}`, { [paramKey]: value.$like })
    } else if ('$ilike' in value) {
      qb.andWhere(`${fieldPath} ILIKE :${paramKey}`, { [paramKey]: value.$ilike })
    } else if ('$in' in value) {
      qb.andWhere(`${fieldPath} IN (:...${paramKey})`, { [paramKey]: value.$in })
    } else if ('$notIn' in value) {
      qb.andWhere(`${fieldPath} NOT IN (:...${paramKey})`, { [paramKey]: value.$notIn })
    } else if ('$eq' in value) {
      qb.andWhere(`${fieldPath} = :${paramKey}`, { [paramKey]: value.$eq })
    } else if ('$ne' in value) {
      qb.andWhere(`${fieldPath} != :${paramKey}`, { [paramKey]: value.$ne })
    } else if ('$gt' in value) {
      qb.andWhere(`${fieldPath} > :${paramKey}`, { [paramKey]: value.$gt })
    } else if ('$gte' in value) {
      qb.andWhere(`${fieldPath} >= :${paramKey}`, { [paramKey]: value.$gte })
    } else if ('$lt' in value) {
      qb.andWhere(`${fieldPath} < :${paramKey}`, { [paramKey]: value.$lt })
    } else if ('$lte' in value) {
      qb.andWhere(`${fieldPath} <= :${paramKey}`, { [paramKey]: value.$lte })
    } else if ('$contains' in value) {
      qb.andWhere(`${fieldPath} @> :${paramKey}`, { [paramKey]: value.$contains })
    } else {
      // fallback: treat as equality
      qb.andWhere(`${fieldPath} = :${paramKey}`, { [paramKey]: value })
    }
  })

  return qb
}
