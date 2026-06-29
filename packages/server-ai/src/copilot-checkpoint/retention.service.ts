import {
    COPILOT_CHECKPOINT_RETENTION_DAYS_SETTING,
    COPILOT_CHECKPOINT_RETENTION_ENABLED_SETTING,
    DEFAULT_COPILOT_CHECKPOINT_RETENTION_DAYS,
    MAX_COPILOT_CHECKPOINT_RETENTION_DAYS,
    MIN_COPILOT_CHECKPOINT_RETENTION_DAYS
} from '@xpert-ai/contracts'
import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { QueryRunner, Repository } from 'typeorm'
import { CopilotCheckpoint } from './copilot-checkpoint.entity'

const DEFAULT_BATCH_SIZE = 1000
const DEFAULT_MAX_BATCHES_PER_RUN = 20
const RETENTION_CRON_LOCK_KEY = 840_139_001

export interface CopilotCheckpointRetentionOptions {
    retentionDays: number
    batchSize: number
    maxBatchesPerRun: number
}

export interface CopilotCheckpointRetentionExecuteResult {
    deletedCheckpointCount: number
    deletedWriteCount: number
    batches: number
    elapsedMs: number
    batchLimitReached: boolean
}

@Injectable()
export class CopilotCheckpointRetentionService {
    readonly #logger = new Logger(CopilotCheckpointRetentionService.name)

    constructor(
        @InjectRepository(CopilotCheckpoint)
        private readonly checkpointRepository: Repository<CopilotCheckpoint>
    ) {}

    async execute(
        options: Partial<CopilotCheckpointRetentionOptions> = {}
    ): Promise<CopilotCheckpointRetentionExecuteResult> {
        const startedAt = Date.now()
        const config = resolveOptions(options)
        let deletedCheckpointCount = 0
        let deletedWriteCount = 0
        let batches = 0

        while (batches < config.maxBatchesPerRun) {
            const rows = await this.checkpointRepository.manager.query(buildCandidateBatchSql(), [
                ...buildCandidateParams(config),
                config.batchSize
            ])
            const ids = rows.map((row) => readString(row, 'id')).filter((id) => id.length > 0)
            if (!ids.length) {
                break
            }

            const batchResult = await this.checkpointRepository.manager.transaction(async (manager) => {
                const [writesResult] = await manager.query(buildDeleteWritesByCheckpointIdsSql(), [ids])
                const [checkpointResult] = await manager.query(buildDeleteCheckpointsByIdsSql(), [ids])
                return {
                    deletedWriteCount: readNumber(writesResult, 'count'),
                    deletedCheckpointCount: readNumber(checkpointResult, 'count')
                }
            })

            deletedWriteCount += batchResult.deletedWriteCount
            deletedCheckpointCount += batchResult.deletedCheckpointCount
            batches++
        }

        const result = {
            deletedCheckpointCount,
            deletedWriteCount,
            batches,
            elapsedMs: Date.now() - startedAt,
            batchLimitReached: batches >= config.maxBatchesPerRun
        }

        this.#logger.log(
            `checkpoint retention execute: checkpoints=${result.deletedCheckpointCount}, writes=${result.deletedWriteCount}, batches=${result.batches}, batchLimitReached=${result.batchLimitReached}, elapsedMs=${result.elapsedMs}`
        )

        return result
    }

    @Cron('0 0 3 * * *')
    async runScheduledCleanup(): Promise<void> {
        const queryRunner = this.checkpointRepository.manager.connection.createQueryRunner()
        let connected = false

        try {
            await queryRunner.connect()
            connected = true

            const lockAcquired = await this.acquireRetentionCronLock(queryRunner)
            if (!lockAcquired) {
                return
            }

            try {
                await this.execute()
            } finally {
                await this.releaseRetentionCronLock(queryRunner)
            }
        } finally {
            if (connected) {
                await queryRunner.release()
            }
        }
    }

    private async acquireRetentionCronLock(queryRunner: QueryRunner): Promise<boolean> {
        try {
            const rows = await queryRunner.query('select pg_try_advisory_lock($1) as locked', [RETENTION_CRON_LOCK_KEY])
            if (!Array.isArray(rows) || rows.length === 0) {
                return false
            }
            const first = rows[0]
            if (!first || typeof first !== 'object' || !('locked' in first)) {
                return false
            }
            const locked = first.locked
            return locked === true || locked === 't' || locked === 1
        } catch (error) {
            this.#logger.warn(`checkpoint retention cron lock unavailable, skip this tick: ${getErrorMessage(error)}`)
            return false
        }
    }

    private async releaseRetentionCronLock(queryRunner: QueryRunner): Promise<void> {
        try {
            await queryRunner.query('select pg_advisory_unlock($1)', [RETENTION_CRON_LOCK_KEY])
        } catch (error) {
            this.#logger.warn(`checkpoint retention cron unlock failed: ${getErrorMessage(error)}`)
        }
    }
}

function resolveOptions(options: Partial<CopilotCheckpointRetentionOptions>): CopilotCheckpointRetentionOptions {
    return {
        retentionDays: normalizeRetentionDays(options.retentionDays),
        batchSize: normalizeBatchSize(options.batchSize),
        maxBatchesPerRun: normalizeMaxBatchesPerRun(options.maxBatchesPerRun)
    }
}

function normalizeRetentionDays(value: number | undefined): number {
    return Number.isInteger(value) &&
        value >= MIN_COPILOT_CHECKPOINT_RETENTION_DAYS &&
        value <= MAX_COPILOT_CHECKPOINT_RETENTION_DAYS
        ? value
        : DEFAULT_COPILOT_CHECKPOINT_RETENTION_DAYS
}

function normalizeBatchSize(value: number | undefined): number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0
        ? Math.min(value, DEFAULT_BATCH_SIZE)
        : DEFAULT_BATCH_SIZE
}

function normalizeMaxBatchesPerRun(value: number | undefined): number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0
        ? Math.min(value, DEFAULT_MAX_BATCHES_PER_RUN)
        : DEFAULT_MAX_BATCHES_PER_RUN
}

function buildCandidateParams(config: CopilotCheckpointRetentionOptions) {
    return [
        COPILOT_CHECKPOINT_RETENTION_ENABLED_SETTING,
        COPILOT_CHECKPOINT_RETENTION_DAYS_SETTING,
        config.retentionDays,
        MAX_COPILOT_CHECKPOINT_RETENTION_DAYS
    ]
}

function buildRetentionDaysSql() {
    return `
COALESCE(
	CASE
        WHEN td.value ~ '^[1-9][0-9]{0,8}$' AND td.value::int <= $4::int THEN td.value::int
	END,
	$3::int
)`
}

function buildTenantSettingJoinSql() {
    return `
JOIN tenant_setting te
	ON te."tenantId" IS NOT DISTINCT FROM c."tenantId"
	AND te.name = $1
	AND lower(COALESCE(te.value, '')) IN ('1', 'true', 'yes', 'on')
LEFT JOIN tenant_setting td
	ON td."tenantId" IS NOT DISTINCT FROM c."tenantId"
	AND td.name = $2`
}

function buildCandidateBatchSql() {
    return `
SELECT c.id
FROM copilot_checkpoint c
${buildTenantSettingJoinSql()}
WHERE c."createdAt" < now() - make_interval(days => ${buildRetentionDaysSql()})
ORDER BY c."createdAt" ASC
LIMIT $5::int
`
}

function buildDeleteWritesByCheckpointIdsSql() {
    return `
WITH candidates AS (
	SELECT "tenantId", "organizationId", thread_id, checkpoint_ns, checkpoint_id
	FROM copilot_checkpoint
	WHERE id = ANY($1::uuid[])
),
deleted AS (
	DELETE FROM copilot_checkpoint_writes w
	USING candidates c
	WHERE w."tenantId" IS NOT DISTINCT FROM c."tenantId"
		AND w."organizationId" IS NOT DISTINCT FROM c."organizationId"
		AND w.thread_id = c.thread_id
		AND w.checkpoint_ns IS NOT DISTINCT FROM c.checkpoint_ns
		AND w.checkpoint_id = c.checkpoint_id
	RETURNING 1
)
SELECT count(*)::int AS count
FROM deleted
`
}

function buildDeleteCheckpointsByIdsSql() {
    return `
WITH deleted AS (
	DELETE FROM copilot_checkpoint
	WHERE id = ANY($1::uuid[])
	RETURNING 1
)
SELECT count(*)::int AS count
FROM deleted
`
}

function readNumber(row: unknown, key: string): number {
    const value = readValue(row, key)
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value
    }
    if (typeof value === 'bigint') {
        return Number(value)
    }
    if (typeof value === 'string') {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : 0
    }
    return 0
}

function readString(row: unknown, key: string): string {
    const value = readValue(row, key)
    return typeof value === 'string' ? value : ''
}

function readValue(row: unknown, key: string): unknown {
    if (!row || typeof row !== 'object') {
        return undefined
    }
    return Reflect.get(row, key)
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}
