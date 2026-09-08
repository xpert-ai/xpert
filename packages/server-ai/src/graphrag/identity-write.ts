import { FindOptionsWhere, QueryFailedError, Repository } from 'typeorm'
import { KnowledgeGraphEntity, KnowledgeGraphRelation } from './entities'

// Concurrent documents can discover the same identity. Keep the winning row and
// let each caller continue writing its own source contribution and evidence.
export async function saveGraphIdentity<T extends KnowledgeGraphEntity | KnowledgeGraphRelation>(
    repository: Repository<T>,
    item: T,
    where: FindOptionsWhere<T>
): Promise<T> {
    try {
        return await repository.save(item)
    } catch (error) {
        const cause: unknown = error instanceof QueryFailedError ? error.driverError : null
        if (!cause || typeof cause !== 'object' || !('code' in cause) || cause.code !== '23505') throw error
        const existing = await repository.findOne({ where })
        if (!existing) throw error
        return existing
    }
}

export function normalizeKnowledgeGraphName(value: string) {
    return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function normalizeKnowledgeGraphType(value: string) {
    return value.trim().replace(/\s+/g, '_').toLowerCase()
}
