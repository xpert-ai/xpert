import { isStagedRelease } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import type { EvolutionChangeIdentity, EvolutionLifecycleRecord, EvolutionPageQuery } from '@xpert-ai/contracts'
import type { EvolutionCommandContext } from '../application/agent-evolution-governance.service'
import { EvolutionChangeService } from './change.service'
import { ReleasePackageEntity } from '../entities/evolution.entities'
import { lifecycleRecord } from './lifecycle.projection'
import { changeIdentity } from './change.store'

@Injectable()
export class EvolutionLifecycleService {
    constructor(
        @InjectDataSource() private readonly db: DataSource,
        private readonly changes: EvolutionChangeService
    ) {}
    async list(identity: EvolutionChangeIdentity, query: EvolutionPageQuery = {}) {
        const changes = await this.changes.list({ ...identity, targetId: query.targetId })
        const releases = await this.db.getRepository(ReleasePackageEntity).find({ where: changeIdentity(identity) })
        const records = changes.map((change) =>
            lifecycleRecord(
                change,
                releases
                    .map((row) => row.value)
                    .filter(isStagedRelease)
                    .find((release) => release.candidateId === change.changeId)
            )
        )
        const filtered = records
            .filter(
                (item) =>
                    (!query.status || item.publicationStatus === query.status) &&
                    (!query.search ||
                        `${item.title} ${item.targetId}`.toLowerCase().includes(query.search.toLowerCase()))
            )
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
        const page = Math.max(1, Number(query.page) || 1)
        const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 20))
        return { items: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length, page, pageSize }
    }
    async get(identity: EvolutionChangeIdentity, id: string): Promise<EvolutionLifecycleRecord> {
        const change = await this.changes.get({ ...identity, changeId: id })
        const row = await this.db
            .getRepository(ReleasePackageEntity)
            .findOneBy({ ...changeIdentity(identity), releasePackageId: `PUB-${id}` })
        return lifecycleRecord(change, row && isStagedRelease(row.value) ? row.value : undefined)
    }
    async evaluate(
        context: EvolutionCommandContext & EvolutionChangeIdentity,
        id: string,
        datasetSnapshotIds?: Record<string, string>
    ) {
        await this.changes.evaluate({ ...context, changeId: id, ...(datasetSnapshotIds ? { datasetSnapshotIds } : {}) })
        return this.get(context, id)
    }
    async decide(
        context: EvolutionCommandContext & EvolutionChangeIdentity,
        id: string,
        body: { candidateHash: string; evaluationRunId: string; decision: 'approved' | 'rejected'; reason: string }
    ) {
        await this.changes.decide({ ...context, ...body, changeId: id })
        return this.get(context, id)
    }
    async publish(context: EvolutionCommandContext & EvolutionChangeIdentity, id: string) {
        await this.changes.publish({ ...context, changeId: id })
        return this.get(context, id)
    }
}
