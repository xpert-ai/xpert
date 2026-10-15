jest.mock('./agent-plugin-update.service', () => ({ AgentPluginUpdateService: class {} }))
jest.mock('./agent-plugin-cleanup.service', () => ({ AgentPluginCleanupService: class {} }))
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import { AgentPluginMaintenanceController } from './agent-plugin-maintenance.controller'
import { AgentPluginUpdateService } from './agent-plugin-update.service'
import { AgentPluginCleanupService } from './agent-plugin-cleanup.service'
const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
describe('Agent plugin maintenance HTTP validation and DI', () => {
    let app: INestApplication
    let url: string
    const start = jest.fn(async () => ({ phase: 'updating' }))
    const cleanup = jest.fn(async () => ({ deleted: [] }))
    const preview = jest.fn(async () => ({ items: [] }))
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [AgentPluginMaintenanceController],
            providers: [
                { provide: AgentPluginUpdateService, useValue: { start, status: async () => ({ phase: 'idle' }) } },
                { provide: AgentPluginCleanupService, useValue: { cleanup, preview } }
            ]
        }).compile()
        app = module.createNestApplication({ logger: false })
        await app.listen(0, '127.0.0.1')
        url = await app.getUrl()
    })
    afterAll(async () => {
        await app.close()
    })
    const post = (path: string, body: object) =>
        fetch(`${url}/agent-plugins/${path}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body)
        })
    it('accepts updates/resumes and explicit cleanup candidates', async () => {
        expect((await post(`packages/${id}/update`, { branch: ' main ' })).status).toBe(202)
        expect(start).toHaveBeenLastCalledWith(id, { branch: 'main' })
        expect((await post(`packages/${id}/update`, { operationId: id })).status).toBe(202)
        expect((await post(`packages/${id}/cleanup`, { packageIds: [id] })).status).toBe(200)
        expect(cleanup).toHaveBeenLastCalledWith(id, [id])
        expect((await fetch(`${url}/agent-plugins/packages/${id}/cleanup`)).status).toBe(200)
        expect((await fetch(`${url}/agent-plugins/updates`)).status).toBe(200)
    })
    it.each([
        { branch: '' },
        { branch: 'main', organizationId: id },
        { operationId: id, branch: 'other' },
        { operationId: 'bad' },
        { url: 'https://example.test' }
    ])('rejects update overrides or malformed input', async (body) => {
        start.mockClear()
        expect((await post(`packages/${id}/update`, body)).status).toBe(400)
        expect(start).not.toHaveBeenCalled()
    })
    it.each([
        { packageIds: ['bad'] },
        { packageIds: [id], force: true },
        { packageIds: [id], tenantId: id },
        { packageIds: Array(101).fill(id) }
    ])('rejects destructive bypasses', async (body) => {
        cleanup.mockClear()
        expect((await post(`packages/${id}/cleanup`, body)).status).toBe(400)
        expect(cleanup).not.toHaveBeenCalled()
    })
    it('rejects malformed route identities', async () => {
        expect((await post('packages/bad/update', {})).status).toBe(400)
        expect((await fetch(`${url}/agent-plugins/packages/bad/cleanup`)).status).toBe(400)
    })
})
