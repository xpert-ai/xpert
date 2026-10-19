jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { randomUUID } from 'node:crypto'
import { DataSource, EntitySchema } from 'typeorm'
import { AiModelTypeEnum, MembershipLedgerSourceEnum } from '@xpert-ai/contracts'
import { XpertAgentExecution } from '../../../xpert-agent-execution/agent-execution.entity'
import { MembershipPointLedger } from '../../../membership/membership-point-ledger.entity'
import { readPipelineModelUsage } from './pipeline-model-usage'

const url = process.env.XPERT_PIPELINE_TEST_DATABASE_URL
if (url && !/^\/xpert_pipeline_test_[a-z0-9_]+$/.test(new URL(url).pathname))
    throw new Error('Dedicated pipeline test database required')
const integration = url ? describe : describe.skip
const text = { type: 'varchar' as const, nullable: true }
const integer = { type: 'integer' as const, nullable: true }
const base = { id: { type: 'uuid' as const, primary: true }, tenantId: text, organizationId: text }
const numeric = { type: 'double precision' as const, nullable: true }
integration('exact scoped execution ancestry and model ledger aggregation', () => {
    let db: DataSource
    const schema = `pipeline_usage_${randomUUID().replace(/-/g, '')}`
    const context = {
        projectId: randomUUID(),
        actor: { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID() }
    }
    const root = randomUUID(),
        child = randomUUID(),
        unrelated = randomUUID()
    beforeAll(async () => {
        db = new DataSource({
            type: 'postgres',
            url,
            schema,
            entities: [
                new EntitySchema<XpertAgentExecution>({
                    name: 'XpertAgentExecution',
                    target: XpertAgentExecution,
                    columns: { ...base, parentId: text }
                }),
                new EntitySchema<MembershipPointLedger>({
                    name: 'MembershipPointLedger',
                    target: MembershipPointLedger,
                    columns: {
                        ...base,
                        source: text,
                        originType: text,
                        modelType: text,
                        unit: text,
                        authority: text,
                        originExecutionId: text,
                        providerScopeId: text,
                        requestId: text,
                        metricKey: text,
                        revision: integer,
                        provider: text,
                        model: text,
                        promptTokens: integer,
                        completionTokens: integer,
                        totalTokens: integer,
                        pricingStatus: text,
                        priceCurrency: text,
                        priceAmount: numeric
                    }
                })
            ]
        })
        await db.initialize()
        await db.query(`CREATE SCHEMA "${schema}"`)
        await db.synchronize()
    })
    afterAll(async () => {
        if (db?.isInitialized) {
            await db.query(`DROP SCHEMA "${schema}" CASCADE`)
            await db.destroy()
        }
    })
    beforeEach(async () => {
        await db.getRepository(MembershipPointLedger).clear()
        await db.getRepository(XpertAgentExecution).clear()
        await db.getRepository(XpertAgentExecution).insert([
            { id: root, tenantId: context.actor.tenantId, organizationId: context.actor.organizationId },
            {
                id: child,
                parentId: root,
                tenantId: context.actor.tenantId,
                organizationId: context.actor.organizationId
            },
            { id: unrelated, tenantId: context.actor.tenantId, organizationId: context.actor.organizationId }
        ])
    })
    const record = async (patch: Partial<MembershipPointLedger> = {}) =>
        db.getRepository(MembershipPointLedger).insert({
            id: randomUUID(),
            tenantId: context.actor.tenantId,
            organizationId: context.actor.organizationId,
            source: MembershipLedgerSourceEnum.ModelUsage,
            originType: 'model',
            modelType: AiModelTypeEnum.LLM,
            unit: 'token',
            authority: 'provider',
            originExecutionId: child,
            providerScopeId: 'scope',
            requestId: randomUUID(),
            metricKey: 'token',
            revision: 1,
            provider: 'provider',
            model: 'model',
            promptTokens: 80,
            completionTokens: 20,
            totalTokens: 100,
            pricingStatus: 'priced',
            priceCurrency: 'USD',
            priceAmount: 0.2,
            ...patch
        })
    const read = (ids = [root]) =>
        db.transaction('REPEATABLE READ', (manager) => readPipelineModelUsage(manager, context, ids))

    it('deduplicates shared descendants and excludes unrelated, other-organization and other-tenant facts', async () => {
        const foreign = randomUUID()
        await db
            .getRepository(XpertAgentExecution)
            .insert({ id: foreign, parentId: root, tenantId: context.actor.tenantId, organizationId: randomUUID() })
        await record()
        await record({ originExecutionId: root })
        await record({ originExecutionId: unrelated })
        await record({ originExecutionId: foreign })
        await record({ organizationId: randomUUID() })
        await record({ tenantId: randomUUID() })
        expect(await read([root, root, child])).toMatchObject({
            requestedExecutions: 2,
            executionsWithRecords: 2,
            calls: 2,
            totalTokens: 200,
            costs: [{ currency: 'USD', amount: 0.4, calls: 2 }],
            truncated: false,
            rejectedRecords: 0
        })
    })
    it('does not reconstruct old counters or treat missing ledger attribution as zero usage', async () => {
        await record({ originExecutionId: null })
        await record({ authority: 'request' })
        await record({ originType: 'tool' })
        expect(await read()).toMatchObject({
            requestedExecutions: 1,
            executionsWithRecords: 0,
            calls: 0,
            totalTokens: null,
            costs: []
        })
        expect(await read([randomUUID()])).toMatchObject({ calls: 0, totalTokens: null })
    })
    it('handles cycles without repeated calls and reports invalid facts instead of silently normalizing them', async () => {
        await db.getRepository(XpertAgentExecution).update(root, { parentId: child })
        await record()
        await record({ totalTokens: -1 })
        expect(await read()).toMatchObject({ calls: 1, totalTokens: 100, rejectedRecords: 1, truncated: false })
    })
    it('keeps tenant-wide and organization-specific ancestry separate', async () => {
        await record()
        expect(
            await readPipelineModelUsage(
                db.manager,
                { ...context, actor: { ...context.actor, organizationId: null } },
                [root]
            )
        ).toMatchObject({ calls: 0, totalTokens: null })
    })
})
