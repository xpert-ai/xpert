import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { AiModelTypeEnum, type ModelExecutionPolicy } from '@xpert-ai/contracts'
import {
    DefaultRuntimeCapabilityRegistry,
    ModelExecutionEnvironmentCapability,
    RequestContext,
    XPERT_RUNTIME_CAPABILITIES_TOKEN
} from '@xpert-ai/plugin-sdk'
import { randomUUID } from 'node:crypto'
import { DataSource, EntitySchema, type Repository } from 'typeorm'
import { AssistantExecutionPolicyService } from './assistant-execution-policy.service'
import { ModelExecutionGrantService, hashExecutionCredential } from './execution-grant.service'
import { ModelExecutionPolicyService } from './execution-policy'
import { ModelExecutionSourceService } from './execution-source.service'
import { ModelExecutionGrant } from './execution.entity'

function grantFixture() {
    const actor = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID() }
    const policy: Extract<ModelExecutionPolicy, { enabled: true }> = {
        enabled: true,
        gatewayBaseUrl: 'https://gateway.test',
        tools: [{ id: 'aider', version: '1.0.0', executable: '/aider' }],
        limits: {
            tokenBudget: 1000,
            userTokenBudget: 2000,
            maxConcurrentRequests: 1,
            requestsPerMinute: 10,
            leaseSeconds: 60,
            maxDurationSeconds: 600
        }
    }
    const grant: ModelExecutionGrant = Object.assign(new ModelExecutionGrant(), {
        id: randomUUID(),
        tenantId: actor.tenantId,
        organizationId: actor.organizationId,
        ownerId: actor.userId,
        createdAt: new Date(Date.now() - 10_000),
        status: 'active' as const,
        expiresAt: new Date(Date.now() + 30_000),
        absoluteExpiresAt: new Date(Date.now() + 590_000),
        limits: { ...policy.limits },
        defaultModelId: 'model',
        models: [
            {
                id: 'model',
                copilotId: randomUUID(),
                providerScopeId: randomUUID(),
                providerOrganizationId: actor.organizationId,
                provider: 'fixture',
                model: 'coding',
                modelType: AiModelTypeEnum.LLM,
                capabilities: [],
                protocols: ['openai_chat']
            }
        ],
        context: {
            tenantId: actor.tenantId,
            runtimeOrganizationId: actor.organizationId,
            actorUserId: actor.userId,
            billableUserId: actor.userId,
            xpertId: randomUUID(),
            assistantName: 'Assistant',
            assistantVersion: 'v1',
            conversationId: randomUUID(),
            threadId: 'thread',
            source: { type: 'cli_session', cliSessionId: randomUUID() },
            environment: { type: 'computer', environmentId: randomUUID(), instanceId: 'generation-1' },
            tool: { id: 'aider', version: '1.0.0' }
        }
    })
    return { actor, grant, policy }
}

async function setup() {
    const fixture = grantFixture()
    const { actor, grant, policy } = fixture
    const repository = {
        findOneBy: jest.fn(async () => structuredClone(grant)),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
        create: jest.fn((value) => value),
        save: jest.fn(async (value) => ({ ...value, id: randomUUID(), createdAt: new Date() })),
        manager: { transaction: jest.fn() }
    }
    repository.manager.transaction.mockImplementation((work) =>
        work({
            findOne: async () => structuredClone(grant),
            update: (_entity, criteria, change) => repository.update(criteria, change)
        })
    )
    const assistants = {
        user: jest.fn().mockResolvedValue({ id: actor.userId, tenantId: actor.tenantId }),
        resolve: jest.fn().mockResolvedValue({
            assistant: { id: grant.context.xpertId, name: 'Assistant', version: 'v1' },
            conversation: { threadId: 'thread' },
            models: grant.models,
            defaultModelId: grant.defaultModelId
        })
    }
    const environment = { assertCurrent: jest.fn() }
    const sources = { assertCurrent: jest.fn(), invocationModelSource: jest.fn() }
    const policies = { require: jest.fn().mockResolvedValue(policy) }
    const module = await Test.createTestingModule({
        providers: [
            ModelExecutionGrantService,
            { provide: getRepositoryToken(ModelExecutionGrant), useValue: repository },
            { provide: ModelExecutionPolicyService, useValue: policies },
            { provide: AssistantExecutionPolicyService, useValue: assistants },
            { provide: ModelExecutionSourceService, useValue: sources },
            {
                provide: XPERT_RUNTIME_CAPABILITIES_TOKEN,
                useValue: new DefaultRuntimeCapabilityRegistry().register(
                    ModelExecutionEnvironmentCapability,
                    environment
                )
            }
        ]
    }).compile()
    return {
        ...fixture,
        repository,
        assistants,
        environment,
        sources,
        policies,
        service: module.get(ModelExecutionGrantService)
    }
}

describe('execution grant lifecycle', () => {
    afterEach(() => jest.restoreAllMocks())

    it('issues and revalidates an Invocation grant using its explicit model source without changing the caller', async () => {
        const f = await setup()
        const source = {
            type: 'agent_invocation' as const,
            invocationId: randomUUID(),
            bindingId: randomUUID(),
            bindingRevision: '1'
        }
        const selected = { id: f.grant.context.xpertId, workspaceId: randomUUID() }
        f.sources.invocationModelSource.mockResolvedValue(selected)
        const issued = await f.service.issue(f.actor, {
            conversationId: f.grant.context.conversationId,
            source,
            environment: f.grant.context.environment,
            tool: f.grant.context.tool
        })
        expect(f.assistants.resolve).toHaveBeenCalledWith(
            f.actor,
            f.grant.context.conversationId,
            true,
            false,
            selected
        )
        expect(issued.grant.context.xpertId).toBe(selected.id)
        expect(issued.grant.context.source).toEqual(source)
        f.grant.context.source = source
        await f.service.revalidate(f.grant)
        expect(f.assistants.resolve).toHaveBeenLastCalledWith(
            f.actor,
            f.grant.context.conversationId,
            false,
            false,
            selected
        )
    })

    it('aborts an in-flight request after revocation and stops checking when the request closes', async () => {
        const f = await setup()
        jest.useFakeTimers()
        try {
            const abort = new AbortController()
            const revalidate = jest.spyOn(f.service, 'revalidate').mockRejectedValue(new Error('revoked'))
            const close = f.service.watch(f.grant, abort)
            await jest.advanceTimersByTimeAsync(5000)
            expect(abort.signal.aborted).toBe(true)
            close()
            await jest.advanceTimersByTimeAsync(10000)
            expect(revalidate).toHaveBeenCalledTimes(1)
        } finally {
            jest.useRealTimers()
        }
    })

    it('issues an owner-bound secret once and persists only its hash', async () => {
        const test = await setup()
        const { context } = test.grant
        test.environment.assertCurrent.mockImplementation(async () => {
            expect(RequestContext.currentUserId()).toBe(test.actor.userId)
            expect(RequestContext.getOrganizationId()).toBe(test.actor.organizationId)
        })
        const issued = await test.service.issue(test.actor, {
            conversationId: context.conversationId,
            source: context.source,
            environment: context.environment,
            tool: context.tool
        })
        expect(issued.secret).toMatch(/^xpert-exec-[A-Za-z0-9_-]{43}$/)
        expect(issued.grant.credentialHash).toBe(hashExecutionCredential(issued.secret))
        expect(JSON.stringify(test.repository.save.mock.calls)).not.toContain(issued.secret)
        expect(issued.grant.context).toEqual(context)
        expect(issued.grant.ownerId).toBe(test.actor.userId)
    })

    it('reloads persisted revocation when revalidating an earlier active snapshot', async () => {
        const test = await setup()
        const snapshot = structuredClone(test.grant)
        test.grant.status = 'revoked'
        await expect(test.service.revalidate(snapshot)).rejects.toThrow()
        expect(test.assistants.resolve).not.toHaveBeenCalled()
    })

    it('uses a renewed database lease instead of rejecting an older in-memory expiry', async () => {
        const test = await setup()
        const snapshot = Object.assign(structuredClone(test.grant), { expiresAt: new Date(0) })
        await expect(test.service.revalidate(snapshot)).resolves.toBeDefined()
        expect(snapshot.expiresAt).toEqual(test.grant.expiresAt)
    })

    it('rejects a grant removed after the caller captured it', async () => {
        const test = await setup()
        test.repository.findOneBy.mockResolvedValue(null)
        await expect(test.service.revalidate(structuredClone(test.grant))).rejects.toThrow()
    })

    it.each(['tenantId', 'runtimeOrganizationId', 'actorUserId', 'billableUserId'] as const)(
        'rejects a persisted context whose %s differs from the owning grant',
        async (field) => {
            const test = await setup()
            test.grant.context[field] = randomUUID()
            await expect(test.service.authenticate(`Bearer xpert-exec-${'a'.repeat(43)}`)).rejects.toThrow()
            expect(test.assistants.resolve).not.toHaveBeenCalled()
        }
    )

    it('rejects expiry reached while model authorization is awaiting external work', async () => {
        const test = await setup()
        test.assistants.resolve.mockImplementation(async () => {
            jest.spyOn(Date, 'now').mockReturnValue(test.grant.expiresAt.getTime())
            return { assistant: { id: test.grant.context.xpertId, version: 'v1' }, models: test.grant.models }
        })
        await expect(test.service.authenticate(`Bearer xpert-exec-${'a'.repeat(43)}`)).rejects.toThrow()
    })

    it('clamps renewal to a newly tightened absolute duration', async () => {
        const test = await setup()
        test.grant.createdAt = new Date(Date.now() - 59_000)
        test.policy.limits.maxDurationSeconds = 60
        await test.service.renew(test.grant.id, test.actor)
        const [, change] = test.repository.update.mock.calls[0]
        expect(change.expiresAt.getTime()).toBeLessThanOrEqual(test.grant.createdAt.getTime() + 60_000)
    })

    it('reports denial when a revoke or expiry wins the renewal update', async () => {
        const test = await setup()
        test.repository.update.mockResolvedValue({ affected: 0 })
        await expect(test.service.renew(test.grant.id, test.actor)).rejects.toThrow()
    })

    it('scopes revocation to the owning user and organization', async () => {
        const test = await setup()
        await test.service.revoke(test.grant.id, test.actor)
        expect(test.repository.update).toHaveBeenCalledWith(
            {
                id: test.grant.id,
                tenantId: test.actor.tenantId,
                organizationId: test.actor.organizationId,
                ownerId: test.actor.userId
            },
            { status: 'revoked' }
        )
    })
})

// Explicit opt-in: these tests create tables only in a disposable review database.
const databaseUrl = process.env.XPERT_EXECUTION_TEST_DATABASE_URL
const integration = databaseUrl ? describe : describe.skip
integration('execution lease renewal / PostgreSQL', () => {
    const schemaName = `execution_lease_${randomUUID().replace(/-/g, '')}`
    let database: DataSource
    let repository: Repository<ModelExecutionGrant>
    let fixture: ReturnType<typeof grantFixture>
    let service: ModelExecutionGrantService
    const uuid = { type: 'uuid' as const }
    const schema = new EntitySchema<ModelExecutionGrant>({
        name: 'ModelExecutionGrant',
        target: ModelExecutionGrant,
        tableName: 'model_execution_grant',
        columns: {
            id: { ...uuid, primary: true },
            tenantId: uuid,
            organizationId: uuid,
            ownerId: uuid,
            credentialHash: { type: 'varchar', select: false },
            status: { type: 'varchar' },
            context: { type: 'jsonb' },
            models: { type: 'jsonb' },
            limits: { type: 'jsonb' },
            defaultModelId: { type: 'varchar' },
            createdAt: { type: 'timestamptz' },
            expiresAt: { type: 'timestamptz' },
            absoluteExpiresAt: { type: 'timestamptz' }
        }
    })

    beforeAll(async () => {
        if (!new URL(databaseUrl).pathname.startsWith('/xpert_execution_test_'))
            throw new Error('Dedicated test database required')
        database = await new DataSource({ type: 'postgres', url: databaseUrl }).initialize()
        await database.query(`CREATE SCHEMA ${schemaName}`)
        await database.destroy()
        database = await new DataSource({
            type: 'postgres',
            url: databaseUrl,
            schema: schemaName,
            entities: [schema],
            synchronize: true,
            extra: { application_name: 'xpert-a3-grant-tests', options: `-c search_path=${schemaName},public` }
        }).initialize()
        repository = database.getRepository(ModelExecutionGrant)
    })

    beforeEach(async () => {
        await repository.clear()
        fixture = grantFixture()
        fixture.grant.credentialHash = hashExecutionCredential(`xpert-exec-${'a'.repeat(43)}`)
        await repository.save(fixture.grant)
        const { actor, grant, policy } = fixture
        const module = await Test.createTestingModule({
            providers: [
                ModelExecutionGrantService,
                { provide: getRepositoryToken(ModelExecutionGrant), useValue: repository },
                { provide: ModelExecutionPolicyService, useValue: { require: async () => policy } },
                {
                    provide: AssistantExecutionPolicyService,
                    useValue: {
                        user: async () => ({ id: actor.userId, tenantId: actor.tenantId }),
                        resolve: async () => ({
                            assistant: { id: grant.context.xpertId, version: 'v1' },
                            models: grant.models
                        })
                    }
                },
                {
                    provide: ModelExecutionSourceService,
                    useValue: { assertCurrent: async () => undefined, invocationModelSource: async () => undefined }
                },
                {
                    provide: XPERT_RUNTIME_CAPABILITIES_TOKEN,
                    useValue: new DefaultRuntimeCapabilityRegistry().register(ModelExecutionEnvironmentCapability, {
                        assertCurrent: async () => undefined
                    })
                }
            ]
        }).compile()
        service = module.get(ModelExecutionGrantService)
    })

    afterAll(async () => {
        if (database?.isInitialized) {
            await database.query(`DROP SCHEMA ${schemaName} CASCADE`)
            await database.destroy()
        }
    })

    async function waitFor(query: string) {
        const deadline = Date.now() + 5000
        while (Date.now() < deadline) {
            const rows: Array<{ ready: boolean }> = await database.query(query)
            if (rows[0]?.ready) return
            await new Promise((resolve) => setTimeout(resolve, 20))
        }
        throw new Error('Database condition did not become ready')
    }

    async function withBlockedRenewal(action: (lock: ReturnType<DataSource['createQueryRunner']>) => Promise<void>) {
        const lock = database.createQueryRunner()
        await lock.connect()
        await lock.startTransaction()
        try {
            await lock.query('SELECT id FROM model_execution_grant FOR UPDATE')
            const result = service.renew(fixture.grant.id, fixture.actor).then(
                () => 'renewed',
                () => 'denied'
            )
            await waitFor(`SELECT EXISTS (
                SELECT 1 FROM pg_stat_activity WHERE application_name = 'xpert-a3-grant-tests'
                AND datname = current_database() AND wait_event_type = 'Lock'
            ) AS ready`)
            await action(lock)
            await lock.commitTransaction()
            return await result
        } finally {
            if (lock.isTransactionActive) await lock.rollbackTransaction()
            await lock.release()
        }
    }

    it('renews a valid grant without replacing its credential', async () => {
        await service.renew(fixture.grant.id, fixture.actor)
        const renewed = await repository.findOneByOrFail({ id: fixture.grant.id })
        expect(renewed.expiresAt.getTime()).toBeGreaterThan(fixture.grant.expiresAt.getTime())
        await expect(service.authenticate(`Bearer xpert-exec-${'a'.repeat(43)}`)).resolves.toBeDefined()
    })

    it('cannot renew or revoke another user’s grant', async () => {
        const other = { ...fixture.actor, userId: randomUUID() }
        await expect(service.renew(fixture.grant.id, other)).rejects.toThrow()
        await service.revoke(fixture.grant.id, other)
        expect((await repository.findOneByOrFail({ id: fixture.grant.id })).status).toBe('active')
    })

    it('keeps revocation that wins while renewal is waiting for a row lock', async () => {
        expect(
            await withBlockedRenewal(async (lock) => {
                await lock.manager.update(ModelExecutionGrant, { id: fixture.grant.id }, { status: 'revoked' })
            })
        ).toBe('denied')
        expect((await repository.findOneByOrFail({ id: fixture.grant.id })).status).toBe('revoked')
    })

    it('does not revive a lease that expires behind an unchanged locked row', async () => {
        await database.query(
            'UPDATE model_execution_grant SET "expiresAt" = clock_timestamp() + interval \'2 seconds\''
        )
        expect(
            await withBlockedRenewal(async () => {
                await waitFor('SELECT clock_timestamp() >= "expiresAt" AS ready FROM model_execution_grant')
            })
        ).toBe('denied')
        const expired = await repository.findOneByOrFail({ id: fixture.grant.id })
        expect(expired.expiresAt.getTime()).toBeLessThanOrEqual(Date.now())
    })

    it('persists a tightened maximum duration when renewing', async () => {
        fixture.grant.createdAt = new Date(Date.now() - 59_000)
        fixture.policy.limits.maxDurationSeconds = 60
        await repository.update({ id: fixture.grant.id }, { createdAt: fixture.grant.createdAt })
        await service.renew(fixture.grant.id, fixture.actor)
        const renewed = await repository.findOneByOrFail({ id: fixture.grant.id })
        expect(renewed.expiresAt.getTime()).toBeLessThanOrEqual(fixture.grant.createdAt.getTime() + 60_000)
    })
})

describe('prepared Shell credentials', () => {
    async function shellFixture() {
        const f = await setup()
        f.grant.status = 'pending'
        f.grant.context.source = {
            type: 'shell_execution',
            executionId: randomUUID(),
            shellExecutionId: randomUUID(),
            parentExecutionId: randomUUID(),
            generation: 1,
            profileRevision: '1'
        }
        const selection = {
            assistant: { id: f.grant.context.xpertId, version: 'v1' },
            conversation: { threadId: 'thread' },
            models: f.grant.models,
            defaultModelId: f.grant.defaultModelId
        }
        Object.assign(f.assistants, { resolveForExecution: jest.fn().mockResolvedValue(selection) })
        return f
    }
    it('rejects pending credentials at the gateway before GO activation', async () => {
        const f = await shellFixture()
        await expect(f.service.revalidate(f.grant)).rejects.toThrow()
        expect(f.sources.assertCurrent).not.toHaveBeenCalled()
    })
    it('activates only after fresh source and environment checks', async () => {
        const f = await shellFixture()
        await f.service.activate(f.grant.id, f.actor)
        expect(f.sources.assertCurrent).toHaveBeenCalled()
        expect(f.repository.update).toHaveBeenCalledWith(
            expect.objectContaining({ id: f.grant.id, status: 'pending' }),
            { status: 'active' }
        )
    })
    it('does not revive an expired pending credential', async () => {
        const f = await shellFixture()
        f.grant.expiresAt = new Date(0)
        await expect(f.service.activate(f.grant.id, f.actor)).rejects.toThrow()
        expect(f.repository.update).not.toHaveBeenCalled()
    })
    it('does not activate after a parent task was stopped or model execution was disabled', async () => {
        const f = await shellFixture()
        f.sources.assertCurrent.mockRejectedValueOnce(new Error('parent stopped'))
        await expect(f.service.activate(f.grant.id, f.actor)).rejects.toThrow()
        f.policies.require.mockRejectedValueOnce(new Error('disabled'))
        await expect(f.service.activate(f.grant.id, f.actor)).rejects.toThrow()
        expect(f.repository.update).not.toHaveBeenCalled()
    })
})
