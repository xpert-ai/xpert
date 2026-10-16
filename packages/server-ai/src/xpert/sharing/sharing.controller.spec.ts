import { ForbiddenException, INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { AssistantSharingController } from './sharing.controller'
import { AssistantSharingService } from './sharing.service'

const assistant = '3fa85f64-5717-4562-b3fc-2c963f66afa6'
const member = '3fa85f64-5717-4562-b3fc-2c963f66afa7'
describe('assistant sharing HTTP schema boundary', () => {
    let app: INestApplication, origin: string
    const service = {
        get: jest.fn(),
        candidates: jest.fn(),
        grantUsers: jest.fn(),
        revokeUser: jest.fn(),
        setGroups: jest.fn()
    }
    beforeAll(async () => {
        app = (
            await Test.createTestingModule({
                controllers: [AssistantSharingController],
                providers: [{ provide: AssistantSharingService, useValue: service }]
            }).compile()
        ).createNestApplication({ logger: false })
        await app.listen(0, '127.0.0.1')
        origin = await app.getUrl()
    })
    afterAll(() => app.close())
    beforeEach(() => {
        jest.resetAllMocks()
        service.get.mockResolvedValue({ users: [] })
    })
    const request = (path: string, method = 'GET', body?: object) =>
        fetch(`${origin}/${assistant}/sharing${path}`, {
            method,
            headers: { 'content-type': 'application/json' },
            ...(body ? { body: JSON.stringify(body) } : {})
        })
    it.each([
        {},
        { userIds: [] },
        { userIds: ['invalid'] },
        { userIds: [member], organizationId: member },
        { userIds: [member], permission: 'manage' }
    ])('rejects invalid/unknown fields before granting', async (body) => {
        expect((await request('/users', 'POST', body)).status).toBe(400)
        expect(service.grantUsers).not.toHaveBeenCalled()
    })
    it('applies recipient-search defaults and bounded pagination', async () => {
        expect((await request('/users')).status).toBe(200)
        expect(service.candidates).toHaveBeenCalledWith(assistant, { search: '', skip: 0 })
        expect((await request('/users?search=%20alice%20&skip=30')).status).toBe(200)
        expect(service.candidates).toHaveBeenLastCalledWith(assistant, { search: 'alice', skip: 30 })
        expect((await request('/users?skip=-1')).status).toBe(400)
        expect((await request('/groups?organizationId=other')).status).toBe(400)
    })
    it('routes group candidates through the protected capability and returns permission denial', async () => {
        service.candidates.mockRejectedValue(new ForbiddenException('denied'))
        const response = await request('/groups')
        expect(response.status).toBe(403)
        expect(service.candidates).toHaveBeenCalledWith(assistant, { search: '', skip: 0 }, true)
    })
    it('shares and removes exactly the route recipient', async () => {
        expect((await request('/users', 'POST', { userIds: [member] })).status).toBe(201)
        expect(service.grantUsers).toHaveBeenCalledWith(assistant, [member])
        expect((await request(`/users/${member}`, 'DELETE')).status).toBe(200)
        expect(service.revokeUser).toHaveBeenCalledWith(assistant, member)
        expect((await request('/users/invalid', 'DELETE')).status).toBe(406)
    })
    it('requires an explicit revision for group replacement and rejects scope overrides', async () => {
        expect((await request('/groups', 'PUT', { groupIds: [] })).status).toBe(400)
        expect((await request('/groups', 'PUT', { groupIds: [], revision: 'abc', tenantId: 'other' })).status).toBe(400)
        expect(service.setGroups).not.toHaveBeenCalled()
        expect((await request('/groups', 'PUT', { groupIds: [], revision: 'abc' })).status).toBe(200)
        expect(service.setGroups).toHaveBeenCalledWith(assistant, [], 'abc')
    })
})
