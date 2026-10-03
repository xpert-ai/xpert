import { randomUUID } from 'node:crypto'
import { DataSource, EntitySchema } from 'typeorm'
import { AiModelTypeEnum, ModelExecutionModel } from '@xpert-ai/contracts'
import { ModelGatewayCall } from '../model-gateway/model-gateway-call.entity'
import { ModelExecutionGrant } from './execution.entity'
import { ModelExecutionAdmissionService } from './execution-admission.service'

// Explicitly opt into an expendable database. Never initialize against the application database.
const url = process.env.XPERT_EXECUTION_TEST_DATABASE_URL
const integration = url ? describe : describe.skip
integration('execution admission / PostgreSQL', () => {
    const schemaName = `execution_admission_${randomUUID().replace(/-/g, '')}`
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
            status: { type: 'varchar' },
            limits: { type: 'jsonb' },
            context: { type: 'jsonb' },
            expiresAt: { type: 'timestamptz' },
            absoluteExpiresAt: { type: 'timestamptz' }
        }
    })
    const callSchema = new EntitySchema<ModelGatewayCall>({
        name: 'ModelGatewayCall',
        target: ModelGatewayCall,
        tableName: 'model_gateway_call',
        columns: {
            id: { ...uuid, primary: true, generated: 'uuid' },
            tenantId: uuid,
            organizationId: uuid,
            userId: uuid,
            source: { type: 'varchar' },
            grantId: uuid,
            callId: uuid,
            requestId: { type: 'varchar', unique: true },
            apiKeyId: { ...uuid, nullable: true },
            publicationId: { ...uuid, nullable: true },
            externalModelId: { type: 'varchar' },
            provider: { type: 'varchar' },
            model: { type: 'varchar' },
            status: { type: 'varchar' },
            startedAt: { type: 'timestamptz' },
            dispatchedAt: { type: 'timestamptz', nullable: true },
            reservedTokens: { type: 'int' },
            usageSource: { type: 'varchar' },
            inputTokens: { type: 'int' },
            outputTokens: { type: 'int' },
            totalTokens: { type: 'int' },
            chargedPoints: { type: 'int' },
            excessPoints: { type: 'int' }
        }
    })
    let database: DataSource
    let service: ModelExecutionAdmissionService
    let grant: ModelExecutionGrant
    const model: ModelExecutionModel = {
        id: 'model',
        copilotId: randomUUID(),
        providerScopeId: randomUUID(),
        providerOrganizationId: null,
        provider: 'test',
        model: 'test',
        modelType: AiModelTypeEnum.LLM,
        capabilities: [],
        protocols: ['openai_chat']
    }

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
            entities: [grantSchema, callSchema],
            synchronize: true
        }).initialize()
        service = new ModelExecutionAdmissionService(database)
    })
    beforeEach(async () => {
        await database.query('TRUNCATE model_gateway_call, model_execution_grant')
        grant = Object.assign(new ModelExecutionGrant(), {
            id: randomUUID(),
            tenantId: randomUUID(),
            organizationId: randomUUID(),
            ownerId: randomUUID(),
            status: 'active',
            context: { source: { type: 'cli_session', cliSessionId: randomUUID() } },
            expiresAt: new Date(Date.now() + 60_000),
            absoluteExpiresAt: new Date(Date.now() + 600_000),
            limits: {
                maxInputTokens: 80,
                maxOutputTokens: 20,
                tokenBudget: 200,
                userTokenBudget: 300,
                maxConcurrentRequests: 10,
                requestsPerMinute: 100,
                leaseSeconds: 60,
                maxDurationSeconds: 600
            }
        })
        await database.getRepository(ModelExecutionGrant).save(grant)
    })
    afterAll(async () => {
        if (database?.isInitialized) {
            await database.query(`DROP SCHEMA ${schemaName} CASCADE`)
            await database.destroy()
        }
    })

    it('shares one parent budget across simultaneous CLI children and retains completed sibling consumption', async () => {
        const parentExecutionId = randomUUID()
        grant.context.source = {
            type: 'shell_execution',
            executionId: randomUUID(),
            shellExecutionId: randomUUID(),
            parentExecutionId,
            generation: 1,
            profileRevision: '1'
        }
        grant.limits.userTokenBudget = 1000
        await database.getRepository(ModelExecutionGrant).save(grant)
        const siblings = await Promise.all(
            Array.from({ length: 4 }, async () => {
                const sibling = Object.assign(new ModelExecutionGrant(), structuredClone(grant), { id: randomUUID() })
                await database.getRepository(ModelExecutionGrant).save(sibling)
                return sibling
            })
        )
        const attempts = await Promise.allSettled(siblings.map((item) => service.begin(item, model, 20)))
        expect(attempts.filter((item) => item.status === 'fulfilled')).toHaveLength(2)
        await database.query(
            'UPDATE model_gateway_call SET status=\'completed\', "totalTokens"=100, "reservedTokens"=0'
        )
        await expect(service.begin(grant, model, 20)).rejects.toThrow()
        grant.context.source = { ...grant.context.source, parentExecutionId: randomUUID() }
        await database.getRepository(ModelExecutionGrant).save(grant)
        await expect(service.begin(grant, model, 20)).resolves.toBeDefined()
    })

    it('applies a tightened parent limit even when another child already used the old budget', async () => {
        grant.context.source = {
            type: 'shell_execution',
            executionId: randomUUID(),
            shellExecutionId: randomUUID(),
            parentExecutionId: randomUUID(),
            generation: 1,
            profileRevision: '1'
        }
        await database.getRepository(ModelExecutionGrant).save(grant)
        await service.begin(grant, model, 20)
        const sibling = Object.assign(new ModelExecutionGrant(), structuredClone(grant), { id: randomUUID() })
        await database.getRepository(ModelExecutionGrant).save(sibling)
        sibling.limits.tokenBudget = 100
        await expect(service.begin(sibling, model, 20)).rejects.toThrow()
    })

    it('serializes simultaneous requests before reserving a finite grant budget', async () => {
        const attempts = await Promise.allSettled(Array.from({ length: 8 }, () => service.begin(grant, model, 20)))
        expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(2)
        const calls = await database.getRepository(ModelGatewayCall).find()
        expect(calls.reduce((sum, call) => sum + call.reservedTokens, 0)).toBe(200)
        expect(new Set(calls.map((call) => call.requestId)).size).toBe(2)
    })
    it('shares the payer budget across grants and retains uncertain reservations', async () => {
        await service.begin(grant, model, 20)
        await service.begin(grant, model, 20)
        await database.query("UPDATE model_gateway_call SET status='settlement_pending'")
        const second = Object.assign(new ModelExecutionGrant(), grant, { id: randomUUID() })
        await database.getRepository(ModelExecutionGrant).save(second)
        await service.begin(second, model, 20)
        await expect(service.begin(second, model, 20)).rejects.toThrow()
        expect(await database.getRepository(ModelGatewayCall).count()).toBe(3)
    })
    it('rechecks revocation inside the admission transaction', async () => {
        await database.query("UPDATE model_execution_grant SET status='revoked'")
        await expect(service.begin(grant, model, 20)).rejects.toThrow()
        expect(await database.getRepository(ModelGatewayCall).count()).toBe(0)
    })
    it('keeps independent users and their budgets separate during simultaneous admission', async () => {
        const second = Object.assign(new ModelExecutionGrant(), grant, { id: randomUUID(), ownerId: randomUUID() })
        await database.getRepository(ModelExecutionGrant).save(second)
        const attempts = await Promise.allSettled(
            [grant, second].flatMap((payer) => Array.from({ length: 5 }, () => service.begin(payer, model, 20)))
        )
        expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(4)
        for (const payer of [grant, second]) {
            const calls = await database.getRepository(ModelGatewayCall).findBy({ userId: payer.ownerId })
            expect(calls).toHaveLength(2)
            expect(calls.every((call) => call.grantId === payer.id)).toBe(true)
        }
    })
    it('applies the payer budget across organizations within the same tenant', async () => {
        const second = Object.assign(new ModelExecutionGrant(), grant, {
            id: randomUUID(),
            organizationId: randomUUID()
        })
        await database.getRepository(ModelExecutionGrant).save(second)
        const attempts = await Promise.allSettled(
            [grant, second].flatMap((scope) => Array.from({ length: 3 }, () => service.begin(scope, model, 20)))
        )
        expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(3)
        const calls = await database.getRepository(ModelGatewayCall).find()
        expect(calls.reduce((total, call) => total + call.reservedTokens, 0)).toBe(300)
    })
    it('persists the dispatch fence exactly once', async () => {
        const call = await service.begin(grant, model, 20)
        const attempts = await Promise.allSettled([service.dispatch(call, grant), service.dispatch(call, grant)])
        expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1)
        expect(
            (await database.getRepository(ModelGatewayCall).findOneByOrFail({ id: call.id })).dispatchedAt
        ).toBeInstanceOf(Date)
    })
    it('rejects revocation between admission and upstream dispatch', async () => {
        const call = await service.begin(grant, model, 20)
        await database.query("UPDATE model_execution_grant SET status='revoked'")
        await expect(service.dispatch(call, grant)).rejects.toThrow()
        expect(
            (await database.getRepository(ModelGatewayCall).findOneByOrFail({ id: call.id })).dispatchedAt
        ).toBeNull()
    })

    it('uses tightened persisted limits instead of an earlier authorization snapshot', async () => {
        await database.getRepository(ModelExecutionGrant).update(grant.id, {
            limits: { ...grant.limits, tokenBudget: 99 }
        })
        await expect(service.begin(grant, model, 20)).rejects.toThrow()
        expect(await database.getRepository(ModelGatewayCall).count()).toBe(0)
    })

    it('rejects output that exceeds the persisted limit before reserving tokens', async () => {
        await database.getRepository(ModelExecutionGrant).update(grant.id, {
            limits: { ...grant.limits, maxOutputTokens: 19 }
        })
        await expect(service.begin(grant, model, 20)).rejects.toThrow()
        expect(await database.getRepository(ModelGatewayCall).count()).toBe(0)
    })

    it('rechecks tightened budgets after admission and before dispatch', async () => {
        const call = await service.begin(grant, model, 20)
        grant.limits.tokenBudget = 99
        await expect(service.dispatch(call, grant)).rejects.toThrow()
        expect(
            (await database.getRepository(ModelGatewayCall).findOneByOrFail({ id: call.id })).dispatchedAt
        ).toBeNull()
    })
})
