import { INestApplication, ConflictException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { PermissionGuard } from '@xpert-ai/server-core'
import { MembershipController } from './membership.controller'
import { MembershipService } from './membership.service'
import { CreateMembershipPlanDto, UpdateMembershipPlanDto } from './dto/membership.dto'

describe('membership storage HTTP validation', () => {
    let app: INestApplication,
        origin: string,
        allowed = true
    const service = {
        createPlan: jest.fn(async (input: CreateMembershipPlanDto) => input),
        updatePlan: jest.fn(async (_id: string, input: UpdateMembershipPlanDto) => input)
    }
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [MembershipController],
            providers: [{ provide: MembershipService, useValue: service }]
        })
            .overrideGuard(PermissionGuard)
            .useValue({ canActivate: () => allowed })
            .compile()
        app = module.createNestApplication({ logger: false })
        await app.listen(0, '127.0.0.1')
        origin = await app.getUrl()
    })
    afterAll(() => app?.close())
    beforeEach(() => {
        jest.clearAllMocks()
        allowed = true
    })
    const request = (body: object, method = 'POST') =>
        fetch(`${origin}/plans${method === 'PATCH' ? '/plan' : ''}`, {
            method,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body)
        })
    it('converts a numeric capacity and preserves clearing / omitted patch semantics', async () => {
        const created = await request({ code: 'paid', name: 'Paid', includedStorageBytes: String(20 * 1024 ** 3) })
        expect(created.status).toBe(201)
        expect(service.createPlan).toHaveBeenCalledWith(
            expect.objectContaining({ includedStorageBytes: 20 * 1024 ** 3 })
        )
        expect((await request({ includedStorageBytes: null }, 'PATCH')).status).toBe(200)
        expect(service.updatePlan).toHaveBeenLastCalledWith(
            'plan',
            expect.objectContaining({ includedStorageBytes: null })
        )
        expect((await request({ name: 'Renamed' }, 'PATCH')).status).toBe(200)
        expect(service.updatePlan.mock.calls.at(-1)?.[1]).not.toHaveProperty('includedStorageBytes')
    })
    it.each([0, -1, 1.5, 'invalid', Number.MAX_SAFE_INTEGER + 1])(
        'rejects invalid capacity %s before mutation',
        async (includedStorageBytes) => {
            expect((await request({ code: 'paid', name: 'Paid', includedStorageBytes })).status).toBe(400)
            expect(service.createPlan).not.toHaveBeenCalled()
        }
    )
    it('rejects extra ownership fields and permission failures before mutation', async () => {
        expect(
            (await request({ code: 'paid', name: 'Paid', includedStorageBytes: 20, tenantId: 'foreign' })).status
        ).toBe(400)
        allowed = false
        expect((await request({ code: 'paid', name: 'Paid', includedStorageBytes: 20 })).status).toBe(403)
        expect(service.createPlan).not.toHaveBeenCalled()
    })
    it('preserves service error status and message', async () => {
        service.updatePlan.mockRejectedValueOnce(new ConflictException('Existing conflict'))
        const response = await request({ includedStorageBytes: 20 }, 'PATCH')
        expect(response.status).toBe(409)
        expect(await response.json()).toMatchObject({ message: 'Existing conflict' })
    })
})
