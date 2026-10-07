// Invariants: public activity is a separate ledger; only the captured invocation can append.
// Item updates and source cursors commit together. Viewer reads never inspect or restart a CLI.
import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { DataSource, MoreThan, LessThanOrEqual } from 'typeorm'
import { createHash, randomUUID } from 'node:crypto'
import {
    executionActivityBatchSchema,
    executionActivityItemSchema,
    type ExecutionActivityPage
} from '@xpert-ai/contracts'
import { type AgentActivityRecorder, type AgentInvocation, isAgentInvocationTerminal } from '@xpert-ai/plugin-sdk'
import { InvocationActivityItem, InvocationActivityState } from './activity.entity'
import { VOLUME_CLIENT, VolumeClient } from '../../shared/volume'
import { invocationError } from '../invocation-runtime'

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
            append: async (input) => {
                const batch = executionActivityBatchSchema.parse(input)
                return this.database.transaction(async (manager) => {
                    const states = manager.getRepository(InvocationActivityState)
                    await states
                        .createQueryBuilder()
                        .insert()
                        .values({ ...identity, seq: 0, bytes: 0, closed: false, expired: false, gaps: [] })
                        .orIgnore()
                        .execute()
                    const state = await states.findOneOrFail({ where: identity, lock: { mode: 'pessimistic_write' } })
                    const checkpoint = () => ({ seq: state.seq, sourceCursor: state.sourceCursor ?? undefined })
                    if (
                        state.closed ||
                        (batch.expectedSourceCursor !== undefined &&
                            batch.expectedSourceCursor !== (state.sourceCursor ?? ''))
                    )
                        return checkpoint()
                    const items = manager.getRepository(InvocationActivityItem)
                    for (const raw of batch.items) {
                        let item = executionActivityItemSchema.parse(
                            JSON.parse(JSON.stringify(raw), (_key, value) =>
                                typeof value === 'string' ? redact(value) : value
                            )
                        )
                        if (item.content.kind === 'tool') delete item.content.outputRef
                        const previous = await items.findOne({
                            where: { invocationId: identity.id, itemId: item.id },
                            order: { seq: 'DESC' }
                        })
                        if (
                            item.content.kind === 'tool' &&
                            item.content.status === 'running' &&
                            previous?.item.content.kind === 'tool' &&
                            ['succeeded', 'failed'].includes(previous.item.content.status)
                        )
                            continue
                        if (item.content.kind === 'tool' && previous?.item.content.kind === 'tool')
                            item = executionActivityItemSchema.parse({
                                ...item,
                                content: { ...previous.item.content, ...item.content }
                            })
                        if (
                            item.content.kind === 'tool' &&
                            raw.content.kind === 'tool' &&
                            raw.content.output !== undefined
                        )
                            delete item.content.outputRef
                        const completeOutput = item.content.kind === 'tool' ? item.content.output : undefined
                        const archiveOutput = !!completeOutput && completeOutput.length > 65536
                        if (item.content.kind === 'tool' && archiveOutput) {
                            item.content.outputRef = {
                                key: createHash('sha256').update(completeOutput).digest('hex'),
                                length: completeOutput.length
                            }
                            item.content.output = completeOutput.slice(0, 65536)
                        }
                        item = executionActivityItemSchema.parse(item)
                        const json = JSON.stringify(item),
                            hash = createHash('sha256').update(json).digest('hex')
                        if (previous?.hash === hash) continue
                        const bytes = Buffer.byteLength(json) + (archiveOutput ? Buffer.byteLength(completeOutput) : 0)
                        if (
                            state.bytes + bytes >
                                configuredLimit(
                                    'EXECUTION_ACTIVITY_MAX_BYTES',
                                    32 * 1024 * 1024,
                                    1024 * 1024,
                                    128 * 1024 * 1024
                                ) ||
                            state.seq >= 20000
                        ) {
                            state.gaps = [...new Set([...state.gaps, 'capture_limit' as const])]
                            continue
                        }
                        if (item.content.kind === 'tool' && archiveOutput && item.content.outputRef) {
                            if (!this.volumes) throw Error('Execution activity storage is unavailable')
                            await this.volume(identity.tenantId, identity.id).writeFile(
                                `${item.content.outputRef.key}.txt`,
                                completeOutput
                            )
                        }
                        state.seq++
                        state.bytes += bytes
                        await items.insert({
                            id: randomUUID(),
                            tenantId: identity.tenantId,
                            organizationId: identity.organizationId,
                            invocationId: identity.id,
                            itemId: item.id,
                            seq: state.seq,
                            firstSeq: previous?.firstSeq ?? state.seq,
                            hash,
                            item
                        })
                    }
                    state.gaps = [...new Set([...state.gaps, ...(batch.gaps ?? [])])]
                    state.expiresAt = new Date(
                        Date.now() + configuredLimit('EXECUTION_ACTIVITY_RETENTION_DAYS', 30, 1, 3650) * 86400000
                    )
                    if (batch.sourceCursor !== undefined) state.sourceCursor = batch.sourceCursor
                    if (batch.complete) {
                        state.closed = true
                        state.expiresAt = new Date(
                            Date.now() + configuredLimit('EXECUTION_ACTIVITY_RETENTION_DAYS', 30, 1, 3650) * 86400000
                        )
                    }
                    await states.save(state)
                    return checkpoint()
                })
            }
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
            for (const state of states)
                await this.database.transaction(async (manager) => {
                    if (this.volumes) await this.volume(state.tenantId, state.id).deleteFile('')
                    await manager.delete(InvocationActivityItem, {
                        invocationId: state.id,
                        tenantId: state.tenantId,
                        organizationId: state.organizationId
                    })
                    await manager.update(InvocationActivityState, { id: state.id }, { expired: true })
                })
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

/** Defense in depth after adapter allowlists; never persist common credential representations. */
export function redact(value: string) {
    return value
        .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [REDACTED]')
        .replace(/\b(?:sk-|xai-)[A-Za-z0-9_-]{16,}/g, '[REDACTED]')
        .replace(/((?:api[_-]?key|access[_-]?token|password|authorization)[\\"'\s:=]+)[^\\"'\s,}]+/gi, '$1[REDACTED]')
}
