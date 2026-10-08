jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { init } from 'i18next'
import { getRepositoryToken } from '@nestjs/typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ModelGatewayCall } from '../model-gateway/model-gateway-call.entity'
import { applicationMetrics } from '../metrics/application-metrics'
import { ModelExecutionGrant } from './execution.entity'
import { ModelExecutionQueryController } from './execution-query.controller'
import { TenantSetting } from '@xpert-ai/server-core'
import { MembershipPointLedger } from '../membership/membership-point-ledger.entity'

// Use the real HTTP parameter pipeline; direct controller calls bypass validation pipes.
describe('execution call query HTTP validation', () => {
    let app: INestApplication
    let origin: string
    const query = {
        select: jest.fn().mockReturnThis(),
        distinct: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn<Promise<[ModelGatewayCall[], number]>, []>(),
        getRawMany: jest.fn()
    }
    const grantQuery = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        distinctOn: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn()
    }
    const grants = { findBy: jest.fn(), createQueryBuilder: () => grantQuery }
    const pointQuery = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn()
    }
    beforeAll(async () => {
        await init({
            lng: 'en',
            resources: { en: { 'server-ai': { Error: { ModelExecutionInvalid: 'Test execution validation error' } } } }
        })
        const module = await Test.createTestingModule({
            controllers: [ModelExecutionQueryController],
            providers: [
                { provide: getRepositoryToken(ModelGatewayCall), useValue: { createQueryBuilder: () => query } },
                { provide: getRepositoryToken(ModelExecutionGrant), useValue: grants },
                {
                    provide: getRepositoryToken(MembershipPointLedger),
                    useValue: { createQueryBuilder: () => pointQuery }
                },
                {
                    provide: getRepositoryToken(TenantSetting),
                    useValue: { findOne: jest.fn().mockResolvedValue({ value: '0.1' }) }
                }
            ]
        }).compile()
        app = module.createNestApplication({ logger: false })
        await app.listen(0, '127.0.0.1')
        origin = await app.getUrl()
    })
    beforeEach(() => {
        jest.clearAllMocks()
        query.getManyAndCount.mockResolvedValue([[], 0])
        query.getRawMany.mockReset()
        pointQuery.getRawMany.mockResolvedValue([])
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(undefined)
        jest.spyOn(applicationMetrics, 'recordModelExecution').mockImplementation(() => {})
    })
    afterEach(() => jest.restoreAllMocks())
    afterAll(async () => app?.close())

    it('returns personal model and tool choices from the same authenticated scope', async () => {
        grantQuery.getRawMany.mockResolvedValue([{ id: 'assistant', name: 'Assistant' }])
        query.getRawMany.mockResolvedValueOnce([{ value: 'model-a' }]).mockResolvedValueOnce([{ value: 'codex' }])
        const response = await fetch(`${origin}/model-execution/call-options`)
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            assistants: [{ id: 'assistant', name: 'Assistant' }],
            models: ['model-a'],
            tools: ['codex']
        })
        expect(grantQuery.where).toHaveBeenCalledWith({ tenantId: 'tenant', organizationId: 'org', ownerId: 'user' })
        expect(query.where).toHaveBeenCalledTimes(2)
        expect(query.where).toHaveBeenCalledWith(expect.any(String), {
            tenantId: 'tenant',
            organizationId: 'org',
            userId: 'user'
        })
    })

    it.each([
        ['priced', true, null, 4.25],
        ['priced', false, null, null],
        ['unpriced', true, null, null],
        ['free', true, null, 0],
        ['pending', false, 'reconciled_no_usage', 0]
    ])(
        'returns points without exposing tokens or money (%s, delivered=%s)',
        async (pricingStatus, delivered, errorCode, points) => {
            const call = Object.assign(new ModelGatewayCall(), {
                id: 'call',
                grantId: 'grant',
                callId: 'logical-call',
                requestId: 'attempt',
                model: 'model-a',
                externalModelId: 'model-a',
                status: 'succeeded',
                usageSource: 'provider',
                inputTokens: 5000,
                outputTokens: 1751,
                totalTokens: 6751,
                reservedTokens: 20,
                estimatedUsage: { totalTokens: 7000 },
                priceAmount: 0.5,
                priceCurrency: 'RMB',
                startedAt: new Date('2026-10-03T00:00:00Z'),
                errorCode,
                usageFact: pricingStatus === 'pending' ? null : { pricingStatus },
                usageDeliveredAt: delivered ? new Date() : null
            })
            query.getManyAndCount.mockResolvedValue([[call], 1])
            grants.findBy.mockResolvedValue([{ id: 'grant', context: { assistantName: 'Assistant' } }])
            pointQuery.getRawMany.mockResolvedValue(
                pricingStatus === 'priced' ? [{ attemptId: 'attempt', points: '4.25' }] : []
            )
            const response = await fetch(`${origin}/model-execution/calls`)
            expect(response.status).toBe(200)
            const result = await response.json()
            expect(result.items[0].points).toBe(points)
            for (const key of [
                'inputTokens',
                'outputTokens',
                'totalTokens',
                'reservedTokens',
                'estimatedUsage',
                'priceAmount',
                'priceCurrency'
            ]) {
                expect(result.items[0]).not.toHaveProperty(key)
            }
            expect(pointQuery.where).toHaveBeenCalledWith('ledger.tenantId = :tenantId', { tenantId: 'tenant' })
            expect(pointQuery.andWhere).toHaveBeenCalledWith('ledger.userId = :userId', { userId: 'user' })
            expect(pointQuery.andWhere).toHaveBeenCalledWith('ledger.runtimeOrganizationId = :organizationId', {
                organizationId: 'org'
            })
            expect(pointQuery.andWhere).toHaveBeenCalledWith(expect.stringContaining('attemptId'), {
                attemptIds: ['attempt']
            })
            expect(pointQuery.andWhere).toHaveBeenCalledWith(expect.stringContaining("ledger.source = 'model_usage'"))
            expect(pointQuery.setParameter).toHaveBeenCalledWith('usageCnyPerPoint', 0.1)
        }
    )

    it('does not turn missing or unconvertible consumption into zero', async () => {
        query.getManyAndCount.mockResolvedValue([
            [
                Object.assign(new ModelGatewayCall(), {
                    id: 'call',
                    grantId: 'grant',
                    requestId: 'attempt',
                    model: 'model',
                    startedAt: new Date(),
                    usageDeliveredAt: new Date(),
                    usageFact: { pricingStatus: 'priced' }
                })
            ],
            1
        ])
        grants.findBy.mockResolvedValue([{ id: 'grant', context: {} }])
        for (const rows of [[], [{ attemptId: 'attempt', points: null }]]) {
            pointQuery.getRawMany.mockResolvedValue(rows)
            const response = await fetch(`${origin}/model-execution/calls`)
            expect(response.status).toBe(200)
            expect((await response.json()).items[0].points).toBeNull()
        }
    })

    it('transforms filters and keeps tenant/org/user predicates', async () => {
        const input = new URLSearchParams({
            entry: 'cli',
            environment: 'computer',
            usageSource: 'estimated',
            pricingStatus: 'pending',
            model: ' shared-model ',
            startedAfter: '2026-10-01T00:00:00Z',
            take: '10',
            skip: '20'
        })
        const response = await fetch(`${origin}/model-execution/calls?${input}`)
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ items: [], total: 0 })
        expect(query.where).toHaveBeenCalledWith(expect.any(String), {
            tenantId: 'tenant',
            organizationId: 'org',
            userId: 'user'
        })
        expect(query.andWhere).toHaveBeenCalledWith(expect.stringContaining('"call"."usageFact"'), {
            pricingStatus: 'pending'
        })
        expect(query.andWhere).toHaveBeenCalledWith('call.usageSource = :usageSource', { usageSource: 'estimated' })
        expect(query.andWhere).toHaveBeenCalledWith('call.model = :model', { model: 'shared-model' })
        expect(query.take).toHaveBeenCalledWith(10)
        expect(query.skip).toHaveBeenCalledWith(20)
    })
    it('filters shell usage by explicit source and CLI child execution id', async () => {
        const id = '9553d705-0601-4e96-84ec-5bd766ae5222'
        const response = await fetch(`${origin}/model-execution/calls?entry=shell&executionId=${id}`)
        expect(response.status).toBe(200)
        await response.json()
        expect(query.andWhere).toHaveBeenCalledWith(expect.any(String), { entry: 'shell_execution' })
        expect(query.andWhere).toHaveBeenCalledWith(expect.stringContaining('executionId'), { executionId: id })
    })

    it('applies pagination defaults before querying', async () => {
        const response = await fetch(`${origin}/model-execution/calls`)
        expect(response.status).toBe(200)
        await response.json()
        expect(query.take).toHaveBeenCalledWith(20)
        expect(query.skip).toHaveBeenCalledWith(0)
    })
    it.each([
        'take=101',
        'skip=-1',
        'take=invalid',
        'take=1&take=2',
        'userId=someone-else',
        'entry=invalid',
        'executionId=not-a-uuid',
        'startedAfter=not-a-date',
        'startedAfter=2026-10-02T00%3A00%3A00Z&startedBefore=2026-10-01T00%3A00%3A00Z'
    ])('rejects invalid query before touching persistence: %s', async (input) => {
        const response = await fetch(`${origin}/model-execution/calls?${input}`)
        expect(response.status).toBe(400)
        expect(await response.json()).toEqual({
            statusCode: 400,
            error: 'Bad Request',
            message: 'Test execution validation error'
        })
        expect(applicationMetrics.recordModelExecution).toHaveBeenCalledTimes(1)
        expect(applicationMetrics.recordModelExecution).toHaveBeenCalledWith('Invalid')
        expect(query.where).not.toHaveBeenCalled()
    })
    it('still requires organization and actor context for a valid query', async () => {
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(undefined)
        const response = await fetch(`${origin}/model-execution/calls`)
        expect(response.status).toBe(403)
        await response.json()
        expect(query.where).not.toHaveBeenCalled()
    })
})
