import { KnowledgebaseTypeEnum } from '@xpert-ai/contracts'
import { randomUUID } from 'node:crypto'
import { DataSource, EntitySchema, EntitySchemaColumnOptions, QueryRunner } from 'typeorm'
import { KnowledgeWikiJob, KnowledgeWikiModelInvocation } from './entities'
import { KnowledgeWikiService } from './knowledge-wiki.service'

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
                    columns: { ...scopeColumns, isCurrent: { type: 'boolean' } }
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
        await runner.query(`CREATE TEMP TABLE knowledge_wiki_job (${columns}, "isCurrent" boolean)`)
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
            counters as never,
            runner.manager.getRepository(KnowledgeWikiModelInvocation),
            counters as never
        )
    })

    afterAll(async () => {
        await runner?.release()
        await db?.destroy()
    })

    beforeEach(async () => {
        await runner.query('TRUNCATE pg_temp.knowledge_wiki_model_invocation, pg_temp.knowledge_wiki_job')
    })

    async function addJob(status: KnowledgeWikiJob['status'] = 'failed', attempt = 1, isCurrent = true) {
        const id = randomUUID()
        await runner.query(`INSERT INTO pg_temp.knowledge_wiki_job VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
            id,
            kbId,
            tenantId,
            orgId,
            attempt,
            status,
            isCurrent
        ])
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
