import { ForbiddenException, GoneException, NotFoundException } from '@nestjs/common'
import type { SelectQueryBuilder } from 'typeorm'
import type { Artifact } from './entities/artifact.entity'

/** Resource ACL is dynamic: filter before pagination so neither rows nor totals reveal inaccessible resources. */
export async function listAuthorizedArtifacts(
    query: SelectQueryBuilder<Artifact>,
    authorize: (artifact: Artifact) => Promise<void>,
    page: number,
    pageSize: number
): Promise<{ items: Artifact[]; total: number }> {
    const batchSize = 100
    const start = (page - 1) * pageSize
    const items: Artifact[] = []
    let total = 0
    for (let offset = 0; ; offset += batchSize) {
        const batch = await query.clone().skip(offset).take(batchSize).getMany()
        for (const artifact of batch) {
            try { await authorize(artifact) }
            catch (error) {
                if (error instanceof ForbiddenException || error instanceof NotFoundException || error instanceof GoneException) continue
                throw error
            }
            if (total >= start && items.length < pageSize) items.push(artifact)
            total++
        }
        if (batch.length < batchSize) break
    }
    return { items, total }
}
