import { FindOptionsWhere, Repository } from 'typeorm'
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import { KnowledgeGraphEntity, KnowledgeGraphRelation } from './entities'

export function normalizeKnowledgeGraphName(value: string) {
    return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function normalizeKnowledgeGraphType(value: string) {
    return value.trim().replace(/\s+/g, '_').toLowerCase()
}

/** ON CONFLICT keeps the surrounding projection transaction usable after a concurrent insert. */
export async function insertGraphIdentity<T extends KnowledgeGraphEntity | KnowledgeGraphRelation>(
    repository: Repository<T>,
    item: T,
    where: FindOptionsWhere<T>
): Promise<T> {
    await repository
        .createQueryBuilder()
        .insert()
        .values(item as QueryDeepPartialEntity<T>)
        .orIgnore()
        .execute()
    return repository.findOneOrFail({ where })
}
