jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { randomUUID } from 'node:crypto'
import { RuntimeDeliveryController } from './runtime-delivery.controller'
import { RuntimeMessageAccessService } from './runtime-message-access.service'
import { runtimeMessageError } from './runtime-message.errors'

describe('runtime delivery HTTP boundary', () => {
    let app: INestApplication
    let origin: string
    const id = randomUUID()
    const find = jest.fn(async () => [])
    const update = jest.fn(async () => undefined)
    const execute = jest.fn(async () => undefined)
    const query = { update: () => ({ set: () => ({ where: () => ({ andWhere: () => ({ execute }) }) }) }) }
    const manager = { getRepository: () => ({ find, update, createQueryBuilder: () => query }) }
    const access = { withReceiptOwner: jest.fn(), withReply: jest.fn() }
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [RuntimeDeliveryController],
            providers: [
                {
                    provide: DataSource,
                    useValue: {
                        ...manager,
                        transaction: async (work: (value: typeof manager) => Promise<void>) => work(manager)
                    }
                },
                { provide: RuntimeMessageAccessService, useValue: access }
            ]
        }).compile()
        app = module.createNestApplication()
        await app.listen(0)
        origin = await app.getUrl()
    })
    beforeEach(() => {
        jest.clearAllMocks()
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('owner')
        access.withReceiptOwner.mockImplementation(async (_id, _owner, work: () => Promise<unknown>) => work())
        access.withReply.mockImplementation(async (_id, _owner, work: () => Promise<unknown>) => work())
    })
    afterEach(() => jest.restoreAllMocks())
    afterAll(async () => app.close())
    it('returns owner-scoped receipts without invoking a runtime', async () => {
        const response = await fetch(`${origin}/agent-invocations/${id}/delivery`)
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ delivery: [], consumption: [] })
        expect(access.withReceiptOwner).toHaveBeenCalledWith(
            id,
            { tenantId: 'tenant', organizationId: 'org', ownerId: 'owner' },
            expect.any(Function)
        )
        expect(access.withReply).not.toHaveBeenCalled()
    })
    it.each(['invalid', '1'])('rejects invalid invocation id %s before access', async (bad) => {
        const response = await fetch(`${origin}/agent-invocations/${bad}/delivery`)
        expect(response.status).toBe(400)
        expect(access.withReceiptOwner).not.toHaveBeenCalled()
    })
    it('rejects identity or routing fields in redrive bodies', async () => {
        const response = await fetch(`${origin}/agent-invocations/${id}/delivery/redrive`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ownerId: 'other' })
        })
        expect(response.status).toBe(400)
        expect(update).not.toHaveBeenCalled()
    })
    it('reauthorizes redrive and retains existing claims and stop barriers', async () => {
        const response = await fetch(`${origin}/agent-invocations/${id}/delivery/redrive`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}'
        })
        expect(response.status).toBe(201)
        expect(access.withReply).toHaveBeenCalledTimes(1)
        expect(update).toHaveBeenCalledWith(
            expect.objectContaining({ invocationId: id, ownerId: 'owner' }),
            expect.objectContaining({ state: 'pending' })
        )
        expect(execute).toHaveBeenCalledTimes(1)
    })
    it('rejects unauthorized redrive without mutating transport', async () => {
        access.withReply.mockRejectedValueOnce(runtimeMessageError('Access'))
        const response = await fetch(`${origin}/agent-invocations/${id}/delivery/redrive`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}'
        })
        expect(response.status).toBe(403)
        expect(update).not.toHaveBeenCalled()
    })
})
