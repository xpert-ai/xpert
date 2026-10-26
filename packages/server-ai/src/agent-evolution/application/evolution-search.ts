import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm'

/** Expressions come only from the owning repository's fixed display-field allowlist. */
export function applyEvolutionSearch<T extends ObjectLiteral>(
    query: SelectQueryBuilder<T>,
    search: string | undefined,
    expressions: readonly string[]
) {
    if (!search?.trim() || !expressions.length) return
    query.andWhere(`(${expressions.map((field) => `${field} ILIKE :search ESCAPE '!'`).join(' OR ')})`, {
        search: `%${search.trim().replace(/[!%_]/g, '!$&')}%`
    })
}
