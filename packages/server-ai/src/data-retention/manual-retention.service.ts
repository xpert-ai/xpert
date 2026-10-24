// Preview receipts bind the actor and exact IDs. Execution rechecks protection under a DB lock;
// new records never enter an approved batch, and gateway usage is archived atomically.
import { randomUUID } from 'node:crypto'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { BadRequestException, ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common'
import { ManualRetentionPreview, ManualRetentionRange, ManualRetentionResult, RolesEnum } from '@xpert-ai/contracts'
import { getDefaultTenantId, RequestContext } from '@xpert-ai/plugin-sdk'
import { Cache } from 'cache-manager'
import { DataSource } from 'typeorm'
import { z } from 'zod'
import { t } from 'i18next'
import {
    buildDeleteCheckpointsByIdsSql,
    buildDeleteWritesByCheckpointIdsSql
} from '../copilot-checkpoint/retention.sql'
import { ManualRetentionExecute, storedRetentionPreviewSchema } from './manual-retention.schema'
import { deleteSelectedGatewayCallsSql, manualRetentionCandidates, relatedWritesSql } from './manual-retention.sql'

const BATCH_LIMIT = 1000
const PREVIEW_TTL = 5 * 60 * 1000
const rowsSchema = z.array(z.object({ id: z.string().uuid() }))
const countSchema = z.array(z.object({ count: z.coerce.number().int().nonnegative() })).length(1)
const totalsSchema = z
    .array(
        z.object({ matched: z.coerce.number().int().nonnegative(), eligible: z.coerce.number().int().nonnegative() })
    )
    .length(1)

@Injectable()
export class ManualRetentionService {
    private readonly logger = new Logger(ManualRetentionService.name)

    constructor(
        private readonly database: DataSource,
        @Inject(CACHE_MANAGER) private readonly cache: Cache
    ) {}

    private assertAccess() {
        const tenantId = RequestContext.currentTenantId()
        const actorId = RequestContext.currentUserId()
        if (
            !actorId ||
            !getDefaultTenantId() ||
            tenantId !== getDefaultTenantId() ||
            !RequestContext.hasRole(RolesEnum.SUPER_ADMIN)
        ) {
            throw new ForbiddenException(
                t('server-ai:Error.RetentionDefaultTenantRequired', {
                    defaultValue: 'Only a SuperAdmin in the default tenant can manage retention for all tenants.'
                })
            )
        }
        return { actorId, tenantId }
    }

    async preview(range: ManualRetentionRange): Promise<ManualRetentionPreview> {
        const identity = this.assertAccess()
        const result = await this.database.transaction('REPEATABLE READ', async (manager) => {
            await manager.query("SET LOCAL statement_timeout = '30s'")
            const cte = manualRetentionCandidates(range)
            const params = [range.start, range.end]
            const [totals] = totalsSchema.parse(
                await manager.query(
                    `${cte}
                SELECT count(*)::int AS matched, count(*) FILTER (WHERE eligible)::int AS eligible FROM matching`,
                    params
                )
            )
            const ids = rowsSchema
                .parse(
                    await manager.query(
                        `${cte}
                SELECT id FROM matching WHERE eligible ORDER BY date, id LIMIT $3::int`,
                        [...params, BATCH_LIMIT]
                    )
                )
                .map(({ id }) => id)
            const writeCount =
                range.target === 'copilot_checkpoint'
                    ? countSchema.parse(await manager.query(relatedWritesSql, [ids]))[0].count
                    : 0
            return { totals, ids, writeCount }
        })
        const previewToken = randomUUID()
        const expiresAt = Date.now() + PREVIEW_TTL
        await this.cache.set(
            this.cacheKey(previewToken),
            { ...identity, expiresAt, range, ids: result.ids },
            PREVIEW_TTL
        )
        return {
            ...range,
            previewToken,
            expiresAt: new Date(expiresAt).toISOString(),
            scope: 'all_tenants',
            matchedCount: result.totals.matched,
            eligibleCount: result.totals.eligible,
            protectedCount: result.totals.matched - result.totals.eligible,
            selectedCount: result.ids.length,
            relatedWriteCount: result.writeCount,
            batchLimit: BATCH_LIMIT
        }
    }

    async execute(input: ManualRetentionExecute): Promise<ManualRetentionResult> {
        const identity = this.assertAccess()
        const result = await this.database.transaction(async (manager) => {
            await manager.query("SET LOCAL lock_timeout = '5s'")
            await manager.query("SET LOCAL statement_timeout = '30s'")
            // Serialize receipt consumption across processes; a replay can never select a new batch.
            await manager.query('SELECT pg_advisory_xact_lock($1)', [840_139_003])
            const key = this.cacheKey(input.previewToken)
            const parsed = storedRetentionPreviewSchema.safeParse(await this.cache.get(key))
            if (
                !input.confirmed ||
                !parsed.success ||
                parsed.data.expiresAt <= Date.now() ||
                parsed.data.actorId !== identity.actorId ||
                parsed.data.tenantId !== identity.tenantId
            ) {
                throw new BadRequestException(
                    t('server-ai:Error.RetentionPreviewExpired', {
                        defaultValue: 'The preview has expired or is unavailable. Preview the cleanup again.'
                    })
                )
            }
            const receipt = parsed.data
            let deletedCount = 0
            let deletedWriteCount = 0
            if (receipt.range.target === 'copilot_checkpoint') {
                // Keep reference checks stable until deletion commits. Lock only for this bounded batch.
                await manager.query('LOCK TABLE chat_message, chat_conversation_thread IN SHARE MODE')
                await manager.query(
                    'LOCK TABLE copilot_checkpoint, copilot_checkpoint_writes IN SHARE ROW EXCLUSIVE MODE'
                )
                const ids = rowsSchema
                    .parse(
                        await manager.query(
                            `${manualRetentionCandidates(receipt.range)}
                    SELECT id FROM matching WHERE eligible AND id = ANY($3::uuid[])`,
                            [receipt.range.start, receipt.range.end, receipt.ids]
                        )
                    )
                    .map(({ id }) => id)
                const writes = await manager.query(buildDeleteWritesByCheckpointIdsSql(), [ids])
                const checkpoints = await manager.query(buildDeleteCheckpointsByIdsSql(), [ids])
                deletedWriteCount = countSchema.parse(writes)[0].count
                deletedCount = countSchema.parse(checkpoints)[0].count
            } else {
                deletedCount = countSchema.parse(
                    await manager.query(deleteSelectedGatewayCallsSql(manager), [receipt.ids])
                )[0].count
            }
            await this.cache.del(key)
            return { deletedCount, deletedWriteCount, skippedCount: receipt.ids.length - deletedCount }
        })
        this.logger.log(
            `Manual retention completed: records=${result.deletedCount}, writes=${result.deletedWriteCount}, skipped=${result.skippedCount}`
        )
        return result
    }

    private cacheKey(token: string) {
        return `manual-retention-preview:${token}`
    }
}
