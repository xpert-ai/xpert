jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ModelGatewayCallStatusEnum } from '@xpert-ai/contracts'
import { ModelGatewayCall } from '../model-gateway/model-gateway-call.entity'
import { ModelExecutionGrant } from './execution.entity'
import { ModelExecutionReconciliation } from './execution-reconciliation.entity'
import { ModelExecutionReconciliationService } from './execution-reconciliation.service'
import { ModelExecutionMeteringService } from './execution-metering.service'
import { ExecutionReconciliationInput, executionReconciliationSchema } from './execution-reconciliation.schema'

const evidence: ExecutionReconciliationInput = {
    operationId: '00000000-0000-4000-8000-000000000001',
    evidenceReference: 'review-1',
    evidenceSha256: 'a'.repeat(64),
    reason: 'Verified original provider request receipt',
    providerRequestId: 'upstream-1',
    outcome: 'provider_usage',
    inputTokens: 10,
    outputTokens: 5,
    totalTokens: 15,
    priceAmount: null,
    priceCurrency: null
}
async function fixture() {
    const call = Object.assign(new ModelGatewayCall(), {
        id: 'call',
        tenantId: 'tenant',
        organizationId: 'org',
        status: ModelGatewayCallStatusEnum.SettlementPending,
        grantId: 'grant',
        externalModelId: 'alias',
        reservedTokens: 200,
        settlementContext: { billableUserId: 'owner' },
        usageFact: null
    })
    let review: ModelExecutionReconciliation | null = null
    const reviews = {
        findOneBy: jest.fn(async () => review),
        create: (value: Partial<ModelExecutionReconciliation>) =>
            Object.assign(new ModelExecutionReconciliation(), value),
        insert: jest.fn(async (value: ModelExecutionReconciliation) => (review = value)),
        update: jest.fn(async () => ({}))
    }
    const query = {
        addSelect: () => query,
        where: jest.fn().mockReturnThis(),
        setLock: () => query,
        getOne: async () => call,
        getOneOrFail: async () => call
    }
    const manager = {
        getRepository: (entity: object) =>
            entity === ModelExecutionReconciliation ? reviews : { createQueryBuilder: () => query },
        save: jest.fn(async () => call)
    }
    const calls = {
        createQueryBuilder: () => query,
        manager: { transaction: async (fn: (manager: object) => unknown) => fn(manager) }
    }
    const metering = { finish: jest.fn(), deliver: jest.fn() }
    jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('reviewer')
    jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(undefined)
    const module = await Test.createTestingModule({
        providers: [
            ModelExecutionReconciliationService,
            { provide: getRepositoryToken(ModelGatewayCall), useValue: calls },
            {
                provide: getRepositoryToken(ModelExecutionGrant),
                useValue: {
                    findOneByOrFail: async () => ({ id: 'grant', models: [{ id: 'alias', model: 'pinned-model' }] })
                }
            },
            { provide: getRepositoryToken(ModelExecutionReconciliation), useValue: reviews },
            { provide: ModelExecutionMeteringService, useValue: metering }
        ]
    }).compile()
    return { service: module.get(ModelExecutionReconciliationService), call, reviews, metering, query }
}
afterEach(() => jest.restoreAllMocks())
it('persists reviewer evidence and reuses the pinned attempt rather than accepting a new payer or model', async () => {
    const f = await fixture()
    await f.service.reconcile('tenant', 'call', evidence)
    expect(f.reviews.insert).toHaveBeenCalledWith(
        expect.objectContaining({ reviewerId: 'reviewer', tenantId: 'tenant', evidence })
    )
    expect(f.metering.finish).toHaveBeenCalledWith(
        expect.objectContaining({
            call: f.call,
            model: { id: 'alias', model: 'pinned-model' },
            usage: expect.objectContaining({ source: 'provider', totalTokens: 15, priceAmount: null })
        })
    )
    expect(f.query.where).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant' }))
    await expect(
        f.service.reconcile('tenant', 'call', { ...evidence, totalTokens: 16, inputTokens: 11 })
    ).rejects.toThrow()
})
it('releases reservations only for an explicit audited zero-consumption receipt', async () => {
    const f = await fixture()
    await f.service.reconcile('tenant', 'call', {
        ...evidence,
        outcome: 'no_usage',
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        priceAmount: 0,
        priceCurrency: 'CNY'
    })
    expect(f.call.reservedTokens).toBe(0)
    expect(f.call.errorCode).toBe('reconciled_no_usage')
    expect(f.metering.finish).not.toHaveBeenCalled()
})
it('keeps durable review evidence when applying usage fails so restart recovery can retry', async () => {
    const f = await fixture()
    f.metering.finish.mockRejectedValue(new Error('database unavailable'))
    await expect(f.service.reconcile('tenant', 'call', evidence)).rejects.toThrow('database unavailable')
    expect(f.reviews.insert).toHaveBeenCalledTimes(1)
    expect(f.reviews.update).not.toHaveBeenCalled()
})
it('validates persisted evidence again at the recovery boundary', async () => {
    const f = await fixture()
    const review = Object.assign(new ModelExecutionReconciliation(), {
        id: evidence.operationId,
        tenantId: 'tenant',
        callId: 'call',
        appliedAt: null,
        evidence: { ...evidence, totalTokens: 999 }
    })
    await expect(f.service.apply(review)).rejects.toThrow()
    expect(f.query.where).not.toHaveBeenCalled()
    expect(f.metering.finish).not.toHaveBeenCalled()
})
it.each([
    { ...evidence, totalTokens: 999 },
    { ...evidence, inputTokens: -1 },
    { ...evidence, outcome: 'no_usage' },
    { ...evidence, outcome: 'estimated' },
    { ...evidence, priceAmount: 1, priceCurrency: null },
    { ...evidence, billableUserId: 'other' }
])('rejects contradictory or redirected reconciliation evidence', (input) => {
    expect(executionReconciliationSchema.safeParse(input).success).toBe(false)
})
