import { modelExecutionSourceId } from '@xpert-ai/contracts'
import { randomUUID } from 'node:crypto'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { DataSource, EntitySchema } from 'typeorm'
import { ModelExecutionContext, ModelGatewayCallStatusEnum, ModelGatewayUsageSourceEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ModelGatewayCall } from '../model-gateway/model-gateway-call.entity'
import { ModelExecutionGrant } from './execution.entity'
import { ModelExecutionQueryController } from './execution-query.controller'
import { ModelExecutionReconciliation } from './execution-reconciliation.entity'
import { ModelExecutionReconciliationService } from './execution-reconciliation.service'
import { ModelExecutionMeteringService } from './execution-metering.service'
import { ExecutionReconciliationInput } from './execution-reconciliation.schema'

const url = process.env.XPERT_EXECUTION_TEST_DATABASE_URL
const integration = url ? describe : describe.skip

integration('execution queries and operator evidence / PostgreSQL', () => {
    const schemaName = `execution_operations_${randomUUID().replace(/-/g, '')}`
    const uuid = { type: 'uuid' as const }
    const grantSchema = new EntitySchema<ModelExecutionGrant>({
        name: 'ModelExecutionGrant',
        target: ModelExecutionGrant,
        tableName: 'model_execution_grant',
        columns: {
            id: { ...uuid, primary: true },
            tenantId: uuid,
            organizationId: uuid,
            ownerId: uuid,
            context: { type: 'jsonb' },
            createdAt: { type: 'timestamptz', createDate: true }
        }
    })
    const callSchema = new EntitySchema<ModelGatewayCall>({
        name: 'ModelGatewayCall',
        target: ModelGatewayCall,
        tableName: 'model_gateway_call',
        columns: {
            id: { ...uuid, primary: true },
            tenantId: uuid,
            organizationId: uuid,
            userId: uuid,
            source: { type: 'varchar' },
            grantId: uuid,
            callId: uuid,
            requestId: uuid,
            externalModelId: { type: 'varchar' },
            model: { type: 'varchar' },
            status: { type: 'varchar' },
            startedAt: { type: 'timestamptz' },
            completedAt: { type: 'timestamptz', nullable: true },
            usageSource: { type: 'varchar' },
            reservedTokens: { type: 'int' },
            inputTokens: { type: 'int' },
            outputTokens: { type: 'int' },
            totalTokens: { type: 'int' },
            usageFact: { type: 'jsonb', nullable: true, select: false },
            settlementContext: { type: 'jsonb', nullable: true, select: false },
            estimatedUsage: { type: 'jsonb', nullable: true },
            priceAmount: { type: 'float', nullable: true },
            priceCurrency: { type: 'varchar', nullable: true },
            usageDeliveredAt: { type: 'timestamptz', nullable: true },
            errorCode: { type: 'varchar', nullable: true }
        }
    })
    const reviewSchema = new EntitySchema<ModelExecutionReconciliation>({
        name: 'ModelExecutionReconciliation',
        target: ModelExecutionReconciliation,
        tableName: 'model_execution_reconciliation',
        columns: {
            id: { ...uuid, primary: true },
            tenantId: uuid,
            organizationId: uuid,
            callId: uuid,
            reviewerId: uuid,
            evidence: { type: 'jsonb' },
            appliedAt: { type: 'timestamptz', nullable: true },
            createdAt: { type: 'timestamptz', createDate: true }
        },
        uniques: [{ columns: ['tenantId', 'callId'] }]
    })
    let database: DataSource
    let controller: ModelExecutionQueryController
    let reconciliation: ModelExecutionReconciliationService
    const scope = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID() }
    const reviewerId = randomUUID()

    beforeAll(async () => {
        if (!new URL(url).pathname.startsWith('/xpert_execution_test_'))
            throw new Error('Dedicated test database required')
        database = await new DataSource({ type: 'postgres', url }).initialize()
        await database.query(`CREATE SCHEMA ${schemaName}`)
        await database.destroy()
        database = await new DataSource({
            type: 'postgres',
            url,
            schema: schemaName,
            extra: { options: `-c search_path=${schemaName},public` },
            entities: [grantSchema, callSchema, reviewSchema],
            synchronize: true
        }).initialize()
        const module = await Test.createTestingModule({
            providers: [
                ModelExecutionQueryController,
                ModelExecutionReconciliationService,
                { provide: getRepositoryToken(ModelGatewayCall), useValue: database.getRepository(ModelGatewayCall) },
                {
                    provide: getRepositoryToken(ModelExecutionGrant),
                    useValue: database.getRepository(ModelExecutionGrant)
                },
                {
                    provide: getRepositoryToken(ModelExecutionReconciliation),
                    useValue: database.getRepository(ModelExecutionReconciliation)
                },
                { provide: ModelExecutionMeteringService, useValue: { finish: jest.fn(), deliver: jest.fn() } }
            ]
        }).compile()
        controller = module.get(ModelExecutionQueryController)
        reconciliation = module.get(ModelExecutionReconciliationService)
    })
    beforeEach(async () => {
        await database.query('TRUNCATE model_gateway_call, model_execution_grant, model_execution_reconciliation')
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(scope.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(scope.organizationId)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(scope.userId)
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(undefined)
    })
    afterEach(() => jest.restoreAllMocks())
    afterAll(async () => {
        if (database?.isInitialized) {
            await database.query(`DROP SCHEMA ${schemaName} CASCADE`)
            await database.destroy()
        }
    })

    async function seed(overrides: Partial<typeof scope> = {}, name = 'Assistant') {
        const owner = { ...scope, ...overrides }
        const context: ModelExecutionContext = {
            tenantId: owner.tenantId,
            runtimeOrganizationId: owner.organizationId,
            actorUserId: owner.userId,
            billableUserId: owner.userId,
            xpertId: randomUUID(),
            assistantVersion: 'v1',
            assistantName: name,
            conversationId: randomUUID(),
            source: { type: 'cli_session', cliSessionId: randomUUID() },
            environment: { type: 'computer', environmentId: 'computer', instanceId: 'instance' },
            tool: { id: 'test-cli', version: '1' }
        }
        const grant = await database.getRepository(ModelExecutionGrant).save({
            id: randomUUID(),
            tenantId: owner.tenantId,
            organizationId: owner.organizationId,
            ownerId: owner.userId,
            context
        })
        const call = await database.getRepository(ModelGatewayCall).save({
            id: randomUUID(),
            ...owner,
            source: 'execution_grant',
            grantId: grant.id,
            callId: randomUUID(),
            requestId: randomUUID(),
            externalModelId: 'bound-model',
            model: 'model',
            status: ModelGatewayCallStatusEnum.SettlementPending,
            startedAt: new Date('2026-10-01T00:00:00Z'),
            usageSource: ModelGatewayUsageSourceEnum.Estimated,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            reservedTokens: 100,
            estimatedUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 }
        })
        return { call, grant, context }
    }
    function evidence(operationId = randomUUID()): ExecutionReconciliationInput {
        return {
            operationId,
            evidenceReference: 'receipt',
            evidenceSha256: 'a'.repeat(64),
            reason: 'Verified provider receipt confirms no consumption',
            providerRequestId: 'provider-request',
            outcome: 'no_usage',
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            priceAmount: 0,
            priceCurrency: 'CNY'
        }
    }

    it('isolates personal calls and assistant options by tenant, organization and payer', async () => {
        const own = await seed()
        await seed({ userId: randomUUID() }, 'Other user')
        await seed({ organizationId: randomUUID() }, 'Other organization')
        await seed({ tenantId: randomUUID() }, 'Other tenant')
        const result = await controller.list({
            take: 20,
            skip: 0,
            entry: 'cli',
            environment: 'computer',
            pricingStatus: 'pending',
            tool: 'test-cli'
        })
        expect(result.total).toBe(1)
        expect(result.items.map((item) => item.id)).toEqual([own.call.id])
        expect(result.items[0].totalTokens).toBe(0)
        expect(result.items[0].estimatedUsage.totalTokens).toBe(15)
        expect(result.items[0]).not.toHaveProperty('usageFact')
        expect(result.items[0]).not.toHaveProperty('settlementContext')
        expect(await controller.options()).toEqual({ assistants: [{ id: own.context.xpertId, name: 'Assistant' }] })
    })
    it('filters task identity and treats SQL-like tool input as literal text', async () => {
        const own = await seed()
        const executionId = modelExecutionSourceId(own.context.source)
        expect(
            (
                await controller.list({
                    take: 20,
                    skip: 0,
                    executionId,
                    assistantId: own.context.xpertId,
                    conversationId: own.context.conversationId
                })
            ).total
        ).toBe(1)
        expect((await controller.list({ take: 20, skip: 0, tool: "test-cli' OR 1=1 --" })).total).toBe(0)
    })
    it.each([false, true])(
        'keeps an operation ID immutable when reused for another call (different tenant: %s)',
        async (differentTenant) => {
            jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(reviewerId)
            const first = await seed()
            const other = await seed(differentTenant ? { tenantId: randomUUID() } : {})
            const receipt = evidence()
            await reconciliation.reconcile(first.call.tenantId, first.call.id, receipt)
            const original = await database
                .getRepository(ModelExecutionReconciliation)
                .findOneByOrFail({ id: receipt.operationId })
            await expect(reconciliation.reconcile(other.call.tenantId, other.call.id, receipt)).rejects.toThrow()
            expect(
                await database.getRepository(ModelExecutionReconciliation).findOneByOrFail({ id: receipt.operationId })
            ).toEqual(original)
            expect(
                (await database.getRepository(ModelGatewayCall).findOneByOrFail({ id: other.call.id })).reservedTokens
            ).toBe(100)
        }
    )
    it('recovers a persisted review after the apply phase was interrupted', async () => {
        const own = await seed(),
            receipt = evidence()
        const interrupted = jest.spyOn(reconciliation, 'apply').mockRejectedValueOnce(new Error('worker stopped'))
        await expect(reconciliation.reconcile(scope.tenantId, own.call.id, receipt)).rejects.toThrow('worker stopped')
        expect(
            (await database.getRepository(ModelGatewayCall).findOneByOrFail({ id: own.call.id })).reservedTokens
        ).toBe(100)
        interrupted.mockRestore()
        await reconciliation.retry()
        const review = await database
            .getRepository(ModelExecutionReconciliation)
            .findOneByOrFail({ id: receipt.operationId })
        expect(review.appliedAt).toBeInstanceOf(Date)
        expect(
            (await database.getRepository(ModelGatewayCall).findOneByOrFail({ id: own.call.id })).reservedTokens
        ).toBe(0)
    })

    it('replays identical evidence safely and rejects changes to an audited result', async () => {
        const own = await seed(),
            receipt = evidence()
        await Promise.all([
            reconciliation.reconcile(scope.tenantId, own.call.id, receipt),
            reconciliation.reconcile(scope.tenantId, own.call.id, receipt)
        ])
        expect(await database.getRepository(ModelExecutionReconciliation).count()).toBe(1)
        expect(
            (await database.getRepository(ModelGatewayCall).findOneByOrFail({ id: own.call.id })).reservedTokens
        ).toBe(0)
        await expect(
            reconciliation.reconcile(scope.tenantId, own.call.id, {
                ...receipt,
                reason: 'Changed audit evidence reason'
            })
        ).rejects.toThrow()
        expect((await controller.list({ take: 20, skip: 0, pricingStatus: 'free' })).total).toBe(1)
        expect((await controller.list({ take: 20, skip: 0, pricingStatus: 'pending' })).total).toBe(0)
    })
})
