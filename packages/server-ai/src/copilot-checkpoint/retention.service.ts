import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { QueryRunner, Repository } from 'typeorm'
import { CopilotCheckpoint } from './copilot-checkpoint.entity'
import { CopilotCheckpointWrites } from './writes/writes.entity'

const DEFAULT_RETENTION_DAYS = 60
const DEFAULT_OVERSIZED_MAX_PER_THREAD = 10
const DEFAULT_THREAD_MAX_BYTES = 5_368_709_120
const DEFAULT_BATCH_SIZE = 1000
const DEFAULT_MAX_BATCHES_PER_RUN = 20
const DEFAULT_SCHEDULED_CLEANUP_MIN_BYTES = 5_368_709_120
const OVERSIZED_THREAD_REPORT_LIMIT = 20
const RETENTION_CRON_LOCK_KEY = 840_139_001

export interface CopilotCheckpointRetentionOptions {
    retentionDays: number
    oversizedMaxPerThread: number
    threadMaxBytes: number
    batchSize: number
    maxBatchesPerRun: number
}

export interface CopilotCheckpointOversizedThread {
    organizationId: string | null
    threadId: string
    checkpointNs: string
    checkpointCount: number
    checkpointBytes: number
    writesBytes: number
    threadBytes: number
}

export interface CopilotCheckpointRetentionDryRunResult {
    mode: 'dry-run'
    checkpointCount: number
    writesCount: number
    estimatedBytes: number
    oversizedThreads: CopilotCheckpointOversizedThread[]
}

export interface CopilotCheckpointRetentionExecuteResult {
    mode: 'execute'
    deletedCheckpointCount: number
    deletedWriteCount: number
    orphanWriteCount: number
    batches: number
    elapsedMs: number
    batchLimitReached: boolean
}

@Injectable()
export class CopilotCheckpointRetentionService {
    readonly #logger = new Logger(CopilotCheckpointRetentionService.name)

    constructor(
        @InjectRepository(CopilotCheckpoint)
        private readonly checkpointRepository: Repository<CopilotCheckpoint>,
        @InjectRepository(CopilotCheckpointWrites)
        private readonly writesRepository: Repository<CopilotCheckpointWrites>
    ) {}

    async dryRun(
        options: Partial<CopilotCheckpointRetentionOptions> = {}
    ): Promise<CopilotCheckpointRetentionDryRunResult> {
        const config = resolveOptions(options)
        const [statsRow] = await this.checkpointRepository.manager.query(buildDryRunSql(), buildCandidateParams(config))
        const oversizedThreads = await this.loadOversizedThreads(config)
        const result = {
            mode: 'dry-run' as const,
            checkpointCount: readNumber(statsRow, 'checkpointCount'),
            writesCount: readNumber(statsRow, 'writesCount'),
            estimatedBytes: readNumber(statsRow, 'estimatedBytes'),
            oversizedThreads
        }

        this.#logger.log(
            `checkpoint retention dry-run: checkpoints=${result.checkpointCount}, writes=${result.writesCount}, estimatedBytes=${result.estimatedBytes}, oversizedThreads=${oversizedThreads.map((thread) => thread.threadId).join(',')}`
        )

        return result
    }

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

        const batchLimitReached = batches >= config.maxBatchesPerRun
        const [orphanResult] = batchLimitReached
            ? [{ count: 0 }]
            : await this.writesRepository.manager.query(buildDeleteOrphanWritesSql())
        const result = {
            mode: 'execute' as const,
            deletedCheckpointCount,
            deletedWriteCount,
            orphanWriteCount: readNumber(orphanResult, 'count'),
            batches,
            elapsedMs: Date.now() - startedAt,
            batchLimitReached
        }

        this.#logger.log(
            `checkpoint retention execute: checkpoints=${result.deletedCheckpointCount}, writes=${result.deletedWriteCount}, orphanWrites=${result.orphanWriteCount}, batches=${result.batches}, batchLimitReached=${result.batchLimitReached}, elapsedMs=${result.elapsedMs}`
        )

        return result
    }

    @Cron('0 0 3 * * *')
    async runScheduledCleanup(): Promise<void> {
        if (!readBooleanEnv('COPILOT_CHECKPOINT_RETENTION_EXECUTE_ENABLED', false)) {
            this.#logger.log('checkpoint retention scheduled cleanup disabled')
            return
        }

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
                const dryRun = await this.dryRun()
                const scheduledCleanupMinBytes = readPositiveIntegerEnv(
                    'COPILOT_CHECKPOINT_SCHEDULED_CLEANUP_MIN_BYTES',
                    DEFAULT_SCHEDULED_CLEANUP_MIN_BYTES
                )
                const shouldExecute =
                    dryRun.estimatedBytes >= scheduledCleanupMinBytes || dryRun.oversizedThreads.length > 0
                if (!shouldExecute) {
                    this.#logger.log(
                        `checkpoint retention scheduled cleanup skipped: estimatedBytes=${dryRun.estimatedBytes}, oversizedThreads=${dryRun.oversizedThreads.length}`
                    )
                    return
                }

                if (!readBooleanEnv('COPILOT_CHECKPOINT_RETENTION_EXECUTE_ENABLED', false)) {
                    this.#logger.warn(
                        `checkpoint retention scheduled execute disabled: estimatedBytes=${dryRun.estimatedBytes}, oversizedThreads=${dryRun.oversizedThreads.length}`
                    )
                    return
                }

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

    private async loadOversizedThreads(
        config: CopilotCheckpointRetentionOptions
    ): Promise<CopilotCheckpointOversizedThread[]> {
        const rows = await this.checkpointRepository.manager.query(buildOversizedThreadsSql(), [
            config.oversizedMaxPerThread,
            config.threadMaxBytes,
            OVERSIZED_THREAD_REPORT_LIMIT
        ])

        return rows.map((row) => ({
            organizationId: readNullableString(row, 'organizationId'),
            threadId: readString(row, 'threadId'),
            checkpointNs: readString(row, 'checkpointNs'),
            checkpointCount: readNumber(row, 'checkpointCount'),
            checkpointBytes: readNumber(row, 'checkpointBytes'),
            writesBytes: readNumber(row, 'writesBytes'),
            threadBytes: readNumber(row, 'threadBytes')
        }))
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
        retentionDays:
            options.retentionDays ??
            readPositiveIntegerEnv('COPILOT_CHECKPOINT_RETENTION_DAYS', DEFAULT_RETENTION_DAYS),
        oversizedMaxPerThread:
            options.oversizedMaxPerThread ??
            readPositiveIntegerEnv('COPILOT_CHECKPOINT_OVERSIZED_MAX_PER_THREAD', DEFAULT_OVERSIZED_MAX_PER_THREAD),
        threadMaxBytes:
            options.threadMaxBytes ??
            readPositiveIntegerEnv('COPILOT_CHECKPOINT_THREAD_MAX_BYTES', DEFAULT_THREAD_MAX_BYTES),
        batchSize:
            options.batchSize ?? readPositiveIntegerEnv('COPILOT_CHECKPOINT_CLEANUP_BATCH_SIZE', DEFAULT_BATCH_SIZE),
        maxBatchesPerRun:
            options.maxBatchesPerRun ??
            readPositiveIntegerEnv('COPILOT_CHECKPOINT_CLEANUP_MAX_BATCHES_PER_RUN', DEFAULT_MAX_BATCHES_PER_RUN)
    }
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
    const value = Number(process.env[name])
    return Number.isInteger(value) && value > 0 ? value : fallback
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
    const value = process.env[name]
    if (value === undefined) {
        return fallback
    }
    return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function buildCandidateParams(config: CopilotCheckpointRetentionOptions) {
    return [config.retentionDays, config.oversizedMaxPerThread, config.threadMaxBytes]
}

function buildCandidateCteSql() {
    return `
WITH latest_keep AS (
	SELECT id
	FROM (
		SELECT
			c.id,
			row_number() OVER (
				PARTITION BY c."tenantId", c."organizationId", c.thread_id, c.checkpoint_ns
				ORDER BY c."createdAt" DESC
			) AS rn
		FROM copilot_checkpoint c
	) x
	WHERE rn = 1
),
execution_keep AS (
	SELECT c.id
	FROM copilot_checkpoint c
	JOIN xpert_agent_execution e
		ON e."threadId" = c.thread_id
		AND e."tenantId" IS NOT DISTINCT FROM c."tenantId"
		AND COALESCE(e."checkpointNs", '') = c.checkpoint_ns
		AND e."checkpointId" = c.checkpoint_id
	WHERE e."checkpointId" IS NOT NULL
),
checkpoint_counts AS (
	SELECT
		c."tenantId",
		c."organizationId",
		c.thread_id,
		c.checkpoint_ns,
		count(*)::int AS checkpoint_count
	FROM copilot_checkpoint c
	GROUP BY c."tenantId", c."organizationId", c.thread_id, c.checkpoint_ns
),
oversized_thread_candidates AS (
	SELECT
		"tenantId",
		"organizationId",
		thread_id,
		checkpoint_ns,
		checkpoint_count
	FROM checkpoint_counts
	WHERE checkpoint_count > $2::int
),
oversized_checkpoint_size AS (
	SELECT
		c."tenantId",
		c."organizationId",
		c.thread_id,
		c.checkpoint_ns,
		max(otc.checkpoint_count)::int AS checkpoint_count,
		COALESCE(sum(pg_column_size(c.checkpoint)), 0)::bigint AS checkpoint_bytes
	FROM copilot_checkpoint c
	JOIN oversized_thread_candidates otc
		ON otc."tenantId" IS NOT DISTINCT FROM c."tenantId"
		AND otc."organizationId" IS NOT DISTINCT FROM c."organizationId"
		AND otc.thread_id = c.thread_id
		AND otc.checkpoint_ns IS NOT DISTINCT FROM c.checkpoint_ns
	GROUP BY c."tenantId", c."organizationId", c.thread_id, c.checkpoint_ns
),
oversized_writes_size AS (
	SELECT
		w."tenantId",
		w."organizationId",
		w.thread_id,
		w.checkpoint_ns,
		COALESCE(sum(pg_column_size(w.value)), 0)::bigint AS writes_bytes
	FROM copilot_checkpoint_writes w
	JOIN oversized_thread_candidates otc
		ON otc."tenantId" IS NOT DISTINCT FROM w."tenantId"
		AND otc."organizationId" IS NOT DISTINCT FROM w."organizationId"
		AND otc.thread_id = w.thread_id
		AND otc.checkpoint_ns IS NOT DISTINCT FROM w.checkpoint_ns
	GROUP BY w."tenantId", w."organizationId", w.thread_id, w.checkpoint_ns
),
oversized_threads AS (
	SELECT
		cs."tenantId",
		cs."organizationId",
		cs.thread_id,
		cs.checkpoint_ns,
		cs.checkpoint_count,
		cs.checkpoint_bytes,
		COALESCE(ws.writes_bytes, 0)::bigint AS writes_bytes,
		(cs.checkpoint_bytes + COALESCE(ws.writes_bytes, 0))::bigint AS thread_bytes
	FROM oversized_checkpoint_size cs
	LEFT JOIN oversized_writes_size ws
		ON ws."tenantId" IS NOT DISTINCT FROM cs."tenantId"
		AND ws."organizationId" IS NOT DISTINCT FROM cs."organizationId"
		AND ws.thread_id = cs.thread_id
		AND ws.checkpoint_ns IS NOT DISTINCT FROM cs.checkpoint_ns
	WHERE cs.checkpoint_bytes + COALESCE(ws.writes_bytes, 0) >= $3::bigint
),
ranked_oversized AS (
	SELECT
		c.id,
		c."tenantId",
		c."organizationId",
		c.thread_id,
		c.checkpoint_ns,
		c.checkpoint_id,
		c."createdAt",
		pg_column_size(c.checkpoint)::bigint AS row_bytes,
		row_number() OVER (
			PARTITION BY c."tenantId", c."organizationId", c.thread_id, c.checkpoint_ns
			ORDER BY c."createdAt" DESC
		) AS rn,
		ot.thread_bytes
	FROM copilot_checkpoint c
	JOIN oversized_threads ot
		ON ot."tenantId" IS NOT DISTINCT FROM c."tenantId"
		AND ot."organizationId" IS NOT DISTINCT FROM c."organizationId"
		AND ot.thread_id = c.thread_id
		AND ot.checkpoint_ns IS NOT DISTINCT FROM c.checkpoint_ns
),
age_candidates AS (
	SELECT
		c.id,
		c."tenantId",
		c."organizationId",
		c.thread_id,
		c.checkpoint_ns,
		c.checkpoint_id,
		c."createdAt",
		pg_column_size(c.checkpoint)::bigint AS row_bytes
	FROM copilot_checkpoint c
	WHERE c."createdAt" < now() - make_interval(days => $1::int)
		AND NOT EXISTS (SELECT 1 FROM latest_keep keep WHERE keep.id = c.id)
		AND NOT EXISTS (SELECT 1 FROM execution_keep keep WHERE keep.id = c.id)
),
oversized_candidates AS (
	SELECT
		r.id,
		r."tenantId",
		r."organizationId",
		r.thread_id,
		r.checkpoint_ns,
		r.checkpoint_id,
		r."createdAt",
		r.row_bytes
	FROM ranked_oversized r
	WHERE (r.thread_bytes >= $3::bigint AND r.rn > $2::int)
		AND NOT EXISTS (SELECT 1 FROM latest_keep keep WHERE keep.id = r.id)
		AND NOT EXISTS (SELECT 1 FROM execution_keep keep WHERE keep.id = r.id)
),
candidate_checkpoints AS (
	SELECT * FROM age_candidates
	UNION
	SELECT * FROM oversized_candidates
),
candidate_writes_size AS (
	SELECT
		c.id,
		count(*)::int AS candidate_writes_count,
		COALESCE(sum(pg_column_size(w.value)), 0)::bigint AS candidate_writes_bytes
	FROM candidate_checkpoints c
	JOIN copilot_checkpoint_writes w
		ON w."tenantId" IS NOT DISTINCT FROM c."tenantId"
		AND w."organizationId" IS NOT DISTINCT FROM c."organizationId"
		AND w.thread_id = c.thread_id
		AND w.checkpoint_ns IS NOT DISTINCT FROM c.checkpoint_ns
		AND w.checkpoint_id = c.checkpoint_id
	GROUP BY c.id
),
delete_candidates AS (
	SELECT
		c.id,
		c."tenantId",
		c."organizationId",
		c.thread_id,
		c.checkpoint_ns,
		c.checkpoint_id,
		c."createdAt",
		c.row_bytes,
		COALESCE(cws.candidate_writes_count, 0)::int AS candidate_writes_count,
		COALESCE(cws.candidate_writes_bytes, 0)::bigint AS candidate_writes_bytes
	FROM candidate_checkpoints c
	LEFT JOIN candidate_writes_size cws
		ON cws.id = c.id
)
`
}

function buildDryRunSql() {
    return `
${buildCandidateCteSql()}
SELECT
	count(*)::int AS "checkpointCount",
	COALESCE(sum(candidate_writes_count), 0)::int AS "writesCount",
	COALESCE(sum(row_bytes + candidate_writes_bytes), 0)::bigint AS "estimatedBytes"
FROM delete_candidates
`
}

function buildCandidateBatchSql() {
    return `
${buildCandidateCteSql()}
SELECT id
FROM delete_candidates
ORDER BY "createdAt" ASC
LIMIT $4::int
`
}

function buildOversizedThreadsSql() {
    return `
WITH oversized_thread_candidates AS (
	SELECT
		c."tenantId",
		c."organizationId",
		c.thread_id,
		c.checkpoint_ns,
		count(*)::int AS checkpoint_count
	FROM copilot_checkpoint c
	GROUP BY c."tenantId", c."organizationId", c.thread_id, c.checkpoint_ns
	HAVING count(*) > $1::int
),
checkpoint_size AS (
	SELECT
		c."tenantId",
		c."organizationId",
		c.thread_id,
		c.checkpoint_ns,
		max(otc.checkpoint_count)::int AS checkpoint_count,
		COALESCE(sum(pg_column_size(c.checkpoint)), 0)::bigint AS checkpoint_bytes
	FROM copilot_checkpoint c
	JOIN oversized_thread_candidates otc
		ON otc."tenantId" IS NOT DISTINCT FROM c."tenantId"
		AND otc."organizationId" IS NOT DISTINCT FROM c."organizationId"
		AND otc.thread_id = c.thread_id
		AND otc.checkpoint_ns IS NOT DISTINCT FROM c.checkpoint_ns
	GROUP BY c."tenantId", c."organizationId", c.thread_id, c.checkpoint_ns
),
writes_size AS (
	SELECT
		w."tenantId",
		w."organizationId",
		w.thread_id,
		w.checkpoint_ns,
		COALESCE(sum(pg_column_size(w.value)), 0)::bigint AS writes_bytes
	FROM copilot_checkpoint_writes w
	JOIN oversized_thread_candidates otc
		ON otc."tenantId" IS NOT DISTINCT FROM w."tenantId"
		AND otc."organizationId" IS NOT DISTINCT FROM w."organizationId"
		AND otc.thread_id = w.thread_id
		AND otc.checkpoint_ns IS NOT DISTINCT FROM w.checkpoint_ns
	GROUP BY w."tenantId", w."organizationId", w.thread_id, w.checkpoint_ns
)
SELECT
	cs."organizationId",
	cs.thread_id AS "threadId",
	cs.checkpoint_ns AS "checkpointNs",
	cs.checkpoint_count AS "checkpointCount",
	cs.checkpoint_bytes AS "checkpointBytes",
	COALESCE(ws.writes_bytes, 0)::bigint AS "writesBytes",
	(cs.checkpoint_bytes + COALESCE(ws.writes_bytes, 0))::bigint AS "threadBytes"
FROM checkpoint_size cs
LEFT JOIN writes_size ws
	ON ws."tenantId" IS NOT DISTINCT FROM cs."tenantId"
	AND ws."organizationId" IS NOT DISTINCT FROM cs."organizationId"
	AND ws.thread_id = cs.thread_id
	AND ws.checkpoint_ns IS NOT DISTINCT FROM cs.checkpoint_ns
WHERE checkpoint_bytes + COALESCE(ws.writes_bytes, 0) >= $2::bigint
ORDER BY checkpoint_bytes + COALESCE(ws.writes_bytes, 0) DESC
LIMIT $3::int
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

function buildDeleteOrphanWritesSql() {
    return `
WITH deleted AS (
	DELETE FROM copilot_checkpoint_writes w
	WHERE NOT EXISTS (
		SELECT 1
		FROM copilot_checkpoint c
		WHERE c."tenantId" IS NOT DISTINCT FROM w."tenantId"
			AND c."organizationId" IS NOT DISTINCT FROM w."organizationId"
			AND c.thread_id = w.thread_id
			AND c.checkpoint_ns IS NOT DISTINCT FROM w.checkpoint_ns
			AND c.checkpoint_id = w.checkpoint_id
	)
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

function readNullableString(row: unknown, key: string): string | null {
    const value = readValue(row, key)
    return typeof value === 'string' ? value : null
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
