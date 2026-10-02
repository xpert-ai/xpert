import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { init } from 'i18next'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { PERMISSIONS_METADATA } from '@xpert-ai/server-common'
import { PermissionGuard } from '@xpert-ai/server-core'
import { applicationMetrics } from '../metrics/application-metrics'
import { ModelExecutionAdminController } from './execution-admin.controller'
import { ModelExecutionReconciliationService } from './execution-reconciliation.service'
import { ExecutionReconciliationInput } from './execution-reconciliation.schema'
import { ModelExecutionPolicyService } from './execution-policy'

describe('execution administration HTTP boundaries', () => {
    const reconciliation = { pending: jest.fn(), reconcile: jest.fn(), retryDelivery: jest.fn() }
    const policy = { set: jest.fn() }
    const callId = '00000000-0000-4000-8000-000000000002'
    const evidence: ExecutionReconciliationInput = {
        operationId: '00000000-0000-4000-8000-000000000001',
        evidenceReference: ' receipt ',
        evidenceSha256: 'a'.repeat(64),
        reason: ' Verified original provider receipt ',
        providerRequestId: ' request ',
        outcome: 'no_usage',
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        priceAmount: 0,
        priceCurrency: ' CNY '
    }
    let app: INestApplication
    let origin: string
    beforeAll(async () => {
        await init({
            lng: 'en',
            resources: { en: { 'server-ai': { Error: { ModelExecutionInvalid: 'Test execution validation error' } } } }
        })
        const module = await Test.createTestingModule({
            controllers: [ModelExecutionAdminController],
            providers: [
                { provide: ModelExecutionPolicyService, useValue: policy },
                { provide: ModelExecutionReconciliationService, useValue: reconciliation }
            ]
        })
            .overrideGuard(PermissionGuard)
            .useValue({ canActivate: () => true })
            .compile()
        app = module.createNestApplication({ logger: false })
        await app.listen(0, '127.0.0.1')
        origin = await app.getUrl()
    })
    beforeEach(() => {
        jest.clearAllMocks()
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'isTenantScope').mockReturnValue(true)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('reviewer')
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(undefined)
        jest.spyOn(applicationMetrics, 'recordModelExecution').mockImplementation(() => {})
        reconciliation.pending.mockResolvedValue({ items: [], total: 0 })
        reconciliation.reconcile.mockResolvedValue({ status: 'applied' })
        reconciliation.retryDelivery.mockResolvedValue({ delivered: true })
        policy.set.mockResolvedValue({ enabled: false })
    })
    afterEach(() => jest.restoreAllMocks())
    afterAll(async () => app?.close())

    function request(path: string, method = 'GET', body?: unknown) {
        return fetch(`${origin}/model-execution/admin/${path}`, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body)
        })
    }
    async function expectInvalid(response: Response) {
        expect(response.status).toBe(400)
        expect(await response.json()).toEqual({
            statusCode: 400,
            error: 'Bad Request',
            message: 'Test execution validation error'
        })
        expect(applicationMetrics.recordModelExecution).toHaveBeenCalledWith('Invalid')
    }

    it('preserves management permission metadata and converts pagination', async () => {
        expect(Reflect.getMetadata(PERMISSIONS_METADATA, ModelExecutionAdminController)).toContain(
            AIPermissionsEnum.MODEL_GATEWAY_MANAGE
        )
        const response = await request('pending?take=10&skip=20')
        expect(response.status).toBe(200)
        await response.json()
        expect(reconciliation.pending).toHaveBeenCalledWith('tenant', 10, 20)
    })
    it('applies pending pagination defaults', async () => {
        const response = await request('pending')
        expect(response.status).toBe(200)
        await response.json()
        expect(reconciliation.pending).toHaveBeenCalledWith('tenant', 50, 0)
    })
    it.each(['take=101', 'skip=-1', 'take=invalid', 'tenantId=other'])(
        'rejects invalid pending query: %s',
        async (query) => {
            await expectInvalid(await request(`pending?${query}`))
            expect(reconciliation.pending).not.toHaveBeenCalled()
        }
    )
    it('passes normalized evidence to the business service', async () => {
        const response = await request(`calls/${callId}/reconcile`, 'POST', evidence)
        expect(response.status).toBe(201)
        await response.json()
        expect(reconciliation.reconcile).toHaveBeenCalledWith('tenant', callId, {
            ...evidence,
            evidenceReference: 'receipt',
            reason: 'Verified original provider receipt',
            providerRequestId: 'request',
            priceCurrency: 'CNY'
        })
    })
    it.each([
        { ...evidence, totalTokens: 1 },
        { ...evidence, priceCurrency: ' ' },
        { ...evidence, billableUserId: 'other' },
        { ...evidence, outcome: 'estimated' }
    ])('rejects invalid or redirected evidence before the business service: %j', async (body) => {
        await expectInvalid(await request(`calls/${callId}/reconcile`, 'POST', body))
        expect(reconciliation.reconcile).not.toHaveBeenCalled()
    })
    it('preserves UUID validation on reconciliation calls', async () => {
        const response = await request('calls/invalid/reconcile', 'POST', evidence)
        expect(response.status).toBe(400)
        await response.json()
        expect(reconciliation.reconcile).not.toHaveBeenCalled()
    })
    it('accepts an explicit policy object', async () => {
        const response = await request('policy', 'PUT', { enabled: false })
        expect(response.status).toBe(200)
        await response.json()
        expect(policy.set).toHaveBeenCalledWith('tenant', { enabled: false })
    })
    it.each([{}, { enabled: false, tenantId: 'other' }, { enabled: true, limits: {} }])(
        'rejects invalid policy updates: %j',
        async (body) => {
            await expectInvalid(await request('policy', 'PUT', body))
            expect(policy.set).not.toHaveBeenCalled()
        }
    )
    it('rejects organization scope before reading or changing tenant-wide records', async () => {
        jest.spyOn(RequestContext, 'isTenantScope').mockReturnValue(false)
        for (const [path, method, body] of [
            ['pending', 'GET', undefined],
            [`calls/${callId}/reconcile`, 'POST', evidence],
            [`calls/${callId}/retry-delivery`, 'POST', undefined],
            ['policy', 'PUT', { enabled: false }]
        ] as const) {
            const response = await request(path, method, body)
            expect(response.status).toBe(403)
            await response.json()
        }
        expect(reconciliation.pending).not.toHaveBeenCalled()
        expect(reconciliation.reconcile).not.toHaveBeenCalled()
        expect(reconciliation.retryDelivery).not.toHaveBeenCalled()
        expect(policy.set).not.toHaveBeenCalled()
    })
    it('requires an identified operator for settlement retries', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(undefined)
        const response = await request(`calls/${callId}/retry-delivery`, 'POST')
        expect(response.status).toBe(403)
        await response.json()
        expect(reconciliation.retryDelivery).not.toHaveBeenCalled()
    })
})
