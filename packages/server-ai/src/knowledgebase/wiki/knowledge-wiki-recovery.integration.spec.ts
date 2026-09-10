import { KnowledgebaseTypeEnum } from '@xpert-ai/contracts'
import { randomUUID } from 'node:crypto'
import { DataSource, EntitySchema, EntitySchemaColumnOptions, QueryRunner } from 'typeorm'
import { KnowledgeWikiJob, KnowledgeWikiModelInvocation } from './entities'
import { KnowledgeWikiService } from './knowledge-wiki.service'
import { retireSupersededKnowledgeWikiJobs } from './knowledge-wiki-job-current'

const postgresDescribe = process.env.KNOWLEDGE_WIKI_PG_E2E === '1' ? describe : describe.skip
const kbId = randomUUID()
const tenantId = randomUUID()
const orgId = randomUUID()
const scopeColumns = {
    id: { type: 'uuid', primary: true },
    knowledgebaseId: { type: 'uuid' },
    tenantId: { type: 'uuid', nullable: true },
    organizationId: { type: 'uuid', nullable: true },
    generationAttempt: { type: 'int' },
    status: { type: 'varchar' }
} satisfies { [key: string]: EntitySchemaColumnOptions }

postgresDescribe('Wiki recovery status PostgreSQL query', () => {
    let db: DataSource
    let runner: QueryRunner
    let service: KnowledgeWikiService

    beforeAll(async () => {
        db = new DataSource({
            type: 'postgres',
            installExtensions: false,
            host: process.env.DB_HOST ?? '127.0.0.1',
            port: Number(process.env.DB_PORT ?? 5432),
            username: process.env.DB_USER ?? 'postgres',
            password: process.env.DB_PASS ?? 'ocap_password',
            database: process.env.DB_NAME ?? 'ocap',
            entities: [
                new EntitySchema<KnowledgeWikiJob>({
                    name: KnowledgeWikiJob.name,
                    target: KnowledgeWikiJob,
                    tableName: 'knowledge_wiki_job',
                    columns: {
                        ...scopeColumns,
                        isCurrent: { type: 'boolean' },
                        type: { type: 'varchar' },
                        rootJobId: { type: 'uuid', nullable: true },
                        sourceDocumentIdSnapshot: { type: 'uuid', nullable: true },
                        sourceLifecycleGeneration: { type: 'int', nullable: true }
                    }
                }),
                new EntitySchema<KnowledgeWikiModelInvocation>({
                    name: KnowledgeWikiModelInvocation.name,
                    target: KnowledgeWikiModelInvocation,
                    tableName: 'knowledge_wiki_model_invocation',
                    columns: {
                        ...scopeColumns,
                        jobId: { type: 'uuid' },
                        reconciliationStatus: { type: 'varchar' },
                        billingStatus: { type: 'varchar' },
                        errorCode: { type: 'varchar', nullable: true },
                        updatedAt: { type: 'timestamptz' }
                    },
                    relations: {
                        job: { type: 'many-to-one', target: KnowledgeWikiJob.name, joinColumn: { name: 'jobId' } }
                    }
                })
            ]
        })
        await db.initialize()
        runner = db.createQueryRunner()
        await runner.connect()
        // Shadow business tables on this connection; never synchronize or mutate persistent tables.
        const columns =
            'id uuid PRIMARY KEY, "knowledgebaseId" uuid, "tenantId" uuid, "organizationId" uuid, "generationAttempt" int, status text'
        await runner.query(`CREATE TEMP TABLE knowledge_wiki_job (${columns}, "isCurrent" boolean,
            type text DEFAULT 'page_reduce', "rootJobId" uuid, "sourceDocumentIdSnapshot" uuid,
            "sourceLifecycleGeneration" int, "completedAt" timestamptz, "lockedAt" timestamptz,
            "leaseExpiresAt" timestamptz, "heartbeatAt" timestamptz, "updatedAt" timestamptz DEFAULT now())`)
        await runner.query(`CREATE TEMP TABLE knowledge_wiki_source_state (
            "knowledgebaseId" uuid, "tenantId" uuid, "organizationId" uuid,
            "sourceDocumentIdSnapshot" uuid, "lifecycleGeneration" int, "desiredRootJobId" uuid)`)
        await runner.query(`CREATE TEMP TABLE knowledge_wiki_model_invocation (${columns}, "jobId" uuid,
            "reconciliationStatus" text, "billingStatus" text, "errorCode" text, "updatedAt" timestamptz DEFAULT now())`)
        const counters = { count: jest.fn(async () => 0) }
        service = new KnowledgeWikiService(
            {
                findOneByIdString: async () => ({
                    id: kbId,
                    tenantId,
                    organizationId: orgId,
                    type: KnowledgebaseTypeEnum.Standard,
                    wikiStatus: 'ready',
                    wikiAvailability: 'ready',
                    wikiConfig: { enabled: true }
                }),
                canManageKnowledgebase: async () => true
            } as never,
            counters as never,
            {} as never,
            {} as never,
            {} as never,
            runner.manager.getRepository(KnowledgeWikiJob),
            runner.manager.getRepository(KnowledgeWikiModelInvocation),
            counters as never
        )
    })

    afterAll(async () => {
        await runner?.release()
        await db?.destroy()
    })

    beforeEach(async () => {
        await runner.query(
            'TRUNCATE pg_temp.knowledge_wiki_model_invocation, pg_temp.knowledge_wiki_job, pg_temp.knowledge_wiki_source_state'
        )
    })

    async function addJob(status: KnowledgeWikiJob['status'] = 'failed', attempt = 1, isCurrent = true) {
        const id = randomUUID()
        await runner.query(
            `INSERT INTO pg_temp.knowledge_wiki_job
            (id, "knowledgebaseId", "tenantId", "organizationId", "generationAttempt", status, "isCurrent")
            VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [id, kbId, tenantId, orgId, attempt, status, isCurrent]
        )
        return id
    }

    async function addInvocation(jobId: string, input: Partial<KnowledgeWikiModelInvocation> = {}) {
        const id = randomUUID()
        await runner.query(
            `INSERT INTO pg_temp.knowledge_wiki_model_invocation
            (id, "knowledgebaseId", "tenantId", "organizationId", "generationAttempt", status, "jobId",
                "reconciliationStatus", "billingStatus", "errorCode") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [
                id,
                input.knowledgebaseId ?? kbId,
                input.tenantId ?? tenantId,
                input.organizationId ?? orgId,
                input.generationAttempt ?? 1,
                input.status ?? 'indeterminate',
                jobId,
                input.reconciliationStatus ?? 'indeterminate',
                input.billingStatus ?? 'pending',
                input.errorCode ?? null
            ]
        )
        return id
    }

    async function sourceJob(generation: number, status: KnowledgeWikiJob['status'] = 'failed', rootId?: string) {
        const id = await addJob(status)
        await runner.query(
            `UPDATE pg_temp.knowledge_wiki_job SET type = 'source_map',
            "rootJobId" = $2, "sourceDocumentIdSnapshot" = $3, "sourceLifecycleGeneration" = $4 WHERE id = $1`,
            [id, rootId ?? id, kbId, generation]
        )
        return id
    }

    async function currentSource(generation: number, desiredJobId: string, scope = { tenantId, orgId }) {
        await runner.query(`INSERT INTO pg_temp.knowledge_wiki_source_state VALUES ($1,$2,$3,$4,$5,$6)`, [
            kbId,
            scope.tenantId,
            scope.orgId,
            kbId,
            generation,
            desiredJobId
        ])
    }

    it('hides superseded source failures and their downstream failures even when old isCurrent flags remain true', async () => {
        const old = await sourceJob(2)
        const downstream = await addJob()
        await runner.query('UPDATE pg_temp.knowledge_wiki_job SET "rootJobId" = $2 WHERE id = $1', [downstream, old])
        await addInvocation(old)
        await addInvocation(downstream)
        const current = await sourceJob(3, 'succeeded')
        await currentSource(3, current)

        expect(await service.getStatus(kbId)).toMatchObject({
            indeterminateInvocationCount: 0,
            recoveryActions: [],
            generationJobs: { failed: 0 }
        })
        expect(await runner.manager.getRepository(KnowledgeWikiModelInvocation).count()).toBe(2)
    })

    it('hides a superseded rebuild batch but still reports the current source failure', async () => {
        const root = await addJob('succeeded')
        await runner.query("UPDATE pg_temp.knowledge_wiki_job SET type = 'rebuild' WHERE id = $1", [root])
        const old = await sourceJob(2, 'failed', root)
        const downstream = await addJob()
        await runner.query('UPDATE pg_temp.knowledge_wiki_job SET "rootJobId" = $2 WHERE id = $1', [downstream, root])
        await addInvocation(old)
        await addInvocation(downstream)
        const current = await sourceJob(3)
        const invocation = await addInvocation(current)
        await currentSource(3, current)

        expect(await service.getStatus(kbId)).toMatchObject({
            indeterminateInvocationCount: 1,
            recoveryActions: [{ invocationId: invocation, canRetry: true }],
            generationJobs: { failed: 1 }
        })
    })

    it('does not treat a newer source in another tenant as a replacement', async () => {
        const job = await sourceJob(2)
        await addInvocation(job)
        await currentSource(3, randomUUID(), { tenantId: randomUUID(), orgId })
        expect(await service.getStatus(kbId)).toMatchObject({ indeterminateInvocationCount: 1 })
    })

    it('retires superseded batches durably and preserves successful results, billing history and classification', async () => {
        const root = await addJob('succeeded')
        await runner.query("UPDATE pg_temp.knowledge_wiki_job SET type = 'rebuild' WHERE id = $1", [root])
        const old = await sourceJob(2, 'failed', root)
        await addInvocation(old, { billingStatus: 'failed' })
        const child = await addJob('running')
        const classification = await addJob('running')
        await runner.query('UPDATE pg_temp.knowledge_wiki_job SET "rootJobId" = $2 WHERE id = ANY($1::uuid[])', [
            [child, classification],
            root
        ])
        await runner.query("UPDATE pg_temp.knowledge_wiki_job SET type = 'classify' WHERE id = $1", [classification])
        const current = await sourceJob(3, 'succeeded')
        await currentSource(3, current)

        await retireSupersededKnowledgeWikiJobs(runner.manager.getRepository(KnowledgeWikiJob), kbId)
        const jobs = runner.manager.getRepository(KnowledgeWikiJob)
        expect(await jobs.findOneBy({ id: root })).toMatchObject({ status: 'succeeded', isCurrent: false })
        expect(await jobs.findOneBy({ id: old })).toMatchObject({ status: 'stale', isCurrent: false })
        expect(await jobs.findOneBy({ id: child })).toMatchObject({ status: 'stale', isCurrent: false })
        expect(await jobs.findOneBy({ id: current })).toMatchObject({ status: 'succeeded', isCurrent: true })
        expect(await jobs.findOneBy({ id: classification })).toMatchObject({ status: 'running', isCurrent: true })
        expect(await service.getStatus(kbId)).toMatchObject({
            indeterminateInvocationCount: 0,
            recoveryActions: [],
            billingRecoveryCount: 1
        })
        expect(await runner.manager.getRepository(KnowledgeWikiModelInvocation).count()).toBe(1)
    })

    it('retires an older source attempt inside the same rebuild without retiring its replacement batch', async () => {
        const root = await addJob('succeeded')
        await runner.query("UPDATE pg_temp.knowledge_wiki_job SET type = 'rebuild' WHERE id = $1", [root])
        const old = await sourceJob(2, 'failed', root)
        await addInvocation(old)
        const current = await sourceJob(3, 'queued', root)
        await currentSource(3, current)
        await retireSupersededKnowledgeWikiJobs(runner.manager.getRepository(KnowledgeWikiJob))
        const jobs = runner.manager.getRepository(KnowledgeWikiJob)
        expect(await jobs.findOneBy({ id: old })).toMatchObject({ status: 'stale', isCurrent: false })
        expect(await jobs.findOneBy({ id: root })).toMatchObject({ status: 'succeeded', isCurrent: true })
        expect(await jobs.findOneBy({ id: current })).toMatchObject({ status: 'queued', isCurrent: true })
        expect(await service.getStatus(kbId)).toMatchObject({ indeterminateInvocationCount: 0, recoveryActions: [] })
    })

    it('hides an old failed attempt after successful retry while preserving history and billing recovery', async () => {
        const job = await addJob('succeeded')
        await addInvocation(job, { generationAttempt: 0 })
        await addInvocation(job, { status: 'succeeded', billingStatus: 'failed' })
        expect(await service.getStatus(kbId)).toMatchObject({
            indeterminateInvocationCount: 0,
            recoveryActions: [],
            billingRecoveryCount: 1
        })
        expect(await runner.manager.getRepository(KnowledgeWikiModelInvocation).count()).toBe(2)
    })

    it.each(['succeeded', 'cancelled', 'stale', 'queued', 'running'] as const)(
        'does not offer recovery of an uncertain record while its job is %s',
        async (status) => {
            await addInvocation(await addJob(status))
            expect(await service.getStatus(kbId)).toMatchObject({
                indeterminateInvocationCount: 0,
                recoveryActions: []
            })
        }
    )

    it('filters attempts before pagination and counts only the current failure', async () => {
        const job = await addJob()
        const currentId = await addInvocation(job)
        for (let i = 0; i < 25; i++) await addInvocation(job, { generationAttempt: 0 })
        await addInvocation(await addJob('failed', 1, false))
        await addInvocation(job, { tenantId: randomUUID() })
        await addInvocation(job, { knowledgebaseId: randomUUID() })
        expect(await service.getStatus(kbId)).toMatchObject({
            indeterminateInvocationCount: 1,
            recoveryActions: [{ invocationId: currentId, canRetry: true, requiresAdditionalChargeConfirmation: true }]
        })
    })

    it('keeps the full current failure count when the action list is limited', async () => {
        const job = await addJob()
        for (let i = 0; i < 22; i++) await addInvocation(job)
        const status = await service.getStatus(kbId)
        expect(status).toMatchObject({ indeterminateInvocationCount: 22 })
        if (!status.canManage) throw new Error('Expected management status')
        expect(status.recoveryActions).toHaveLength(20)
    })

    it('reports current provider rejection without a charge confirmation and preserves pending reconciliation', async () => {
        const failedId = await addInvocation(await addJob(), {
            status: 'failed',
            reconciliationStatus: 'not_executed',
            errorCode: 'provider_request_rejected'
        })
        const pendingId = await addInvocation(await addJob('running'), {
            status: 'reconciling',
            reconciliationStatus: 'pending'
        })
        const status = await service.getStatus(kbId)
        expect(status).toMatchObject({ indeterminateInvocationCount: 0 })
        if (!status.canManage) throw new Error('Expected management status')
        expect(status.recoveryActions).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    invocationId: failedId,
                    failureReason: 'request_rejected',
                    requiresAdditionalChargeConfirmation: false
                }),
                expect.objectContaining({ invocationId: pendingId, recommendedAction: 'wait', canRetry: false })
            ])
        )
    })
})
