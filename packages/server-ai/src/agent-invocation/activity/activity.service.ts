// Invariants: public activity is a separate ledger; only the captured invocation can append.
// Item updates and source cursors commit together. Viewer reads never inspect or restart a CLI.
import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { DataSource, MoreThan, LessThanOrEqual } from 'typeorm'
import {
    executionActivityBatchSchema,
    executionActivityItemSchema,
    type ExecutionActivityPage,
    type ExecutionActivityBatch
} from '@xpert-ai/contracts'
import { type AgentActivityRecorder, type AgentInvocation, isAgentInvocationTerminal } from '@xpert-ai/plugin-sdk'
import { InvocationActivityItem, InvocationActivityState } from './activity.entity'
import { VOLUME_CLIENT, VolumeClient } from '../../shared/volume'
import { invocationError } from '../invocation-runtime'
import { planActivityAppend, sanitizeActivityItems, type ActivityIdentity } from './activity-append'

@Injectable()
export class InvocationActivityService {
    private readonly logger = new Logger(InvocationActivityService.name)
    constructor(
        private readonly database: DataSource,
        @Optional() @Inject(VOLUME_CLIENT) private readonly volumes?: VolumeClient
    ) {}

    recorder(invocation: AgentInvocation): AgentActivityRecorder {
        const identity = {
            id: invocation.id,
            tenantId: invocation.scope.tenantId,
            organizationId: invocation.scope.organizationId
        }
        return {
            readCheckpoint: async () => {
                const state = await this.database.getRepository(InvocationActivityState).findOneBy(identity)
                return { seq: state?.seq ?? 0, sourceCursor: state?.sourceCursor ?? undefined }
            },
            append: (input) => this.append(identity, executionActivityBatchSchema.parse(input))
        }
    }

    private async append(identity: ActivityIdentity, batch: ExecutionActivityBatch) {
        const input = sanitizeActivityItems(batch.items)
        const checkpoint = (state: Pick<InvocationActivityState, 'seq' | 'sourceCursor'>) => ({
            seq: state.seq,
            sourceCursor: state.sourceCursor ?? undefined
        })
        const stale = (state: Pick<InvocationActivityState, 'closed' | 'sourceCursor'>) =>
            state.closed ||
            (batch.expectedSourceCursor !== undefined && batch.expectedSourceCursor !== (state.sourceCursor ?? ''))
        for (let attempt = 0; attempt < 3; attempt++) {
            const snapshot = (await this.database.getRepository(InvocationActivityState).findOneBy(identity)) ?? {
                seq: 0,
                bytes: 0,
                closed: false,
                sourceCursor: null
            }
            if (stale(snapshot)) return checkpoint(snapshot)
            const itemIds = [...new Set(input.map((item) => item.id))]
            const previous =
                itemIds.length && snapshot.seq
                    ? await this.database
                          .getRepository(InvocationActivityItem)
                          .createQueryBuilder('activity')
                          .distinctOn(['activity.itemId'])
                          .where({
                              tenantId: identity.tenantId,
                              organizationId: identity.organizationId,
                              invocationId: identity.id
                          })
                          .andWhere('activity.itemId IN (:...itemIds)', { itemIds })
                          .andWhere('activity.seq <= :waterline', { waterline: snapshot.seq })
                          .orderBy('activity.itemId', 'ASC')
                          .addOrderBy('activity.seq', 'DESC')
                          .getMany()
                    : []
            const plan = planActivityAppend(
                identity,
                snapshot,
                previous,
                input,
                configuredLimit('EXECUTION_ACTIVITY_MAX_BYTES', 32 * 1024 * 1024, 1024 * 1024, 128 * 1024 * 1024)
            )
            // Content-addressed files are private until a committed item references them.
            // A failed CAS can leave an unreferenced file, reclaimed with the invocation volume.
            try {
                for (const [key, output] of plan.outputs) {
                    if (!this.volumes) throw Error('Execution activity storage is unavailable')
                    await this.volume(identity.tenantId, identity.id).writeFile(`${key}.txt`, output)
                }
                const result = await this.database.transaction(async (manager) => {
                    const states = manager.getRepository(InvocationActivityState)
                    await states
                        .createQueryBuilder()
                        .insert()
                        .values({ ...identity, seq: 0, bytes: 0, closed: false, expired: false, gaps: [] })
                        .orIgnore()
                        .execute()
                    const state = await states.findOneOrFail({ where: identity, lock: { mode: 'pessimistic_write' } })
                    if (stale(state)) return checkpoint(state)
                    if (
                        state.seq !== snapshot.seq ||
                        state.bytes !== snapshot.bytes ||
                        (state.sourceCursor ?? '') !== (snapshot.sourceCursor ?? '')
                    )
                        return null
                    if (plan.rows.length) await manager.getRepository(InvocationActivityItem).insert(plan.rows)
                    const update = {
                        seq: plan.seq,
                        bytes: plan.bytes,
                        gaps: [...new Set([...state.gaps, ...plan.gaps, ...(batch.gaps ?? [])])],
                        sourceCursor: batch.sourceCursor ?? state.sourceCursor,
                        closed: state.closed || !!batch.complete,
                        expiresAt: new Date(
                            Date.now() + configuredLimit('EXECUTION_ACTIVITY_RETENTION_DAYS', 30, 1, 3650) * 86400000
                        )
                    }
                    await states.update(identity, update)
                    return checkpoint(update)
                })
                if (result) return result
            } finally {
                if (plan.outputs.size) await this.reclaimExpiredOutputs(identity)
            }
        }
        throw invocationError('ConcurrentUpdate')
    }

    private async reclaimExpiredOutputs(identity: ActivityIdentity) {
        if (!this.volumes) return
        try {
            const states = this.database.getRepository(InvocationActivityState)
            const state = await states.findOneBy(identity)
            if (!state?.closed || (!state.expired && (!state.expiresAt || state.expiresAt.getTime() > Date.now())))
                return
            // A delayed write can recreate a purged volume. Re-arm retention before
            // deleting it, so a failed cleanup remains eligible for the next sweep.
            await states.update(identity, { expired: false })
            await this.volume(identity.tenantId, identity.id).destroyRuntimeJob()
        } catch {
            // Cleanup must not replace the original append/storage failure.
            this.logger.warn('Late execution activity output cleanup deferred')
        }
    }

    async page(invocation: AgentInvocation, after = 0, limit = 100): Promise<ExecutionActivityPage> {
        const scope = { tenantId: invocation.scope.tenantId, organizationId: invocation.scope.organizationId }
        const state = await this.database
            .getRepository(InvocationActivityState)
            .findOneBy({ ...scope, id: invocation.id })
        const terminal = isAgentInvocationTerminal(invocation.status)
        const expired = state?.expired || (state?.expiresAt && state.expiresAt.getTime() <= Date.now())
        const gaps = [...(state?.gaps ?? [])]
        if (terminal && state && !state.closed && !gaps.includes('interrupted')) gaps.push('interrupted')
        const records = this.database.getRepository(InvocationActivityItem)
        // Each page has a committed waterline. Initial reads use each item's latest
        // version; incremental reads coalesce only changes after the acknowledged seq.
        const latest = records
            .createQueryBuilder('source')
            .select('MAX(source.seq)')
            .where({ ...scope, invocationId: invocation.id, seq: MoreThan(after) })
            .andWhere('source.seq <= :waterline', { waterline: state?.seq ?? 0 })
            .groupBy('source.itemId')
        const rows =
            state && !expired
                ? await records
                      .createQueryBuilder('activity')
                      .where({ ...scope, invocationId: invocation.id })
                      .andWhere(`activity.seq IN (${latest.getQuery()})`)
                      .setParameters(latest.getParameters())
                      .orderBy('activity.seq', 'ASC')
                      .take(limit + 1)
                      .getMany()
                : []
        const page = rows.slice(0, limit)
        return {
            items: page.map((row) => ({
                ...executionActivityItemSchema.parse(row.item),
                seq: row.seq,
                firstSeq: row.firstSeq,
                observedAt: row.createdAt.toISOString()
            })),
            nextCursor: page[page.length - 1]?.seq ?? after,
            hasMore: rows.length > limit,
            state: !state ? 'not_recorded' : expired ? 'expired' : state.closed || terminal ? 'closed' : 'recording',
            gaps
        }
    }

    @Interval(3600000)
    async purgeExpired() {
        try {
            const states = await this.database
                .getRepository(InvocationActivityState)
                .find({ where: { expiresAt: LessThanOrEqual(new Date()), expired: false }, take: 100 })
            for (const state of states) {
                const identity = { id: state.id, tenantId: state.tenantId, organizationId: state.organizationId }
                const claimed = await this.database.transaction(async (manager) => {
                    const rows = manager.getRepository(InvocationActivityState)
                    const current = await rows.findOne({ where: identity, lock: { mode: 'pessimistic_write' } })
                    if (!current || current.expired || !current.expiresAt || current.expiresAt.getTime() > Date.now())
                        return false
                    // Freeze appends before removing files, without holding a connection during I/O.
                    await rows.update(identity, { closed: true })
                    return true
                })
                if (!claimed) continue
                if (this.volumes) await this.volume(state.tenantId, state.id).destroyRuntimeJob()
                await this.database.transaction(async (manager) => {
                    await manager.delete(InvocationActivityItem, {
                        invocationId: state.id,
                        tenantId: state.tenantId,
                        organizationId: state.organizationId
                    })
                    await manager.update(InvocationActivityState, identity, { expired: true })
                })
            }
        } catch {
            this.logger.warn('Execution activity retention cleanup deferred')
        }
    }

    private volume(tenantId: string, invocationId: string) {
        return this.volumes.resolve({ tenantId, catalog: 'runtime-jobs', jobId: `activity-${invocationId}` })
    }

    async output(invocation: AgentInvocation, key: string, offset: number) {
        const state = await this.database.getRepository(InvocationActivityState).findOneBy({
            id: invocation.id,
            tenantId: invocation.scope.tenantId,
            organizationId: invocation.scope.organizationId
        })
        if (!state || state.expired || (state.expiresAt && state.expiresAt.getTime() <= Date.now()) || !this.volumes)
            throw invocationError('NotFound')
        const reference = await this.database
            .getRepository(InvocationActivityItem)
            .createQueryBuilder('activity')
            .where({
                invocationId: invocation.id,
                tenantId: invocation.scope.tenantId,
                organizationId: invocation.scope.organizationId
            })
            .andWhere("activity.item->'content'->'outputRef'->>'key' = :key", { key })
            .getOne()
        if (!reference) throw invocationError('NotFound')
        const content = await this.volume(invocation.scope.tenantId, invocation.id).readFile(`${key}.txt`)
        const text = content.slice(offset, offset + 65536)
        return { text, nextOffset: offset + text.length, hasMore: offset + text.length < content.length }
    }
}

function configuredLimit(name: string, fallback: number, minimum: number, maximum: number) {
    const value = Number(process.env[name])
    return Number.isInteger(value) && value >= minimum && value <= maximum ? value : fallback
}
