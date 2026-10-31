import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { DEFAULT_MODEL_DEFINITIONS } from '@xpert-ai/contracts'
import { ConfigService } from '@xpert-ai/server-config'
import { PermissionGuard } from '@xpert-ai/server-core'
import { CopilotController } from './copilot.controller'
import { CopilotService } from './copilot.service'
import { CopilotRoleDefaultService } from './role-defaults/role-default.service'
import { PrimaryModelSmokeService } from './primary-model-smoke.service'
import { MembershipService } from '../membership'
import { ResolveDefaultModelQuery } from './queries'

describe('default model routing and setup boundary', () => {
    let app: INestApplication
    let url: string
    let allowed = true
    const queries = { execute: jest.fn() }
    const defaults = { setupConnection: jest.fn() }
    const connections = { enableRole: jest.fn(), update: jest.fn() }
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [CopilotController],
            providers: [
                { provide: QueryBus, useValue: queries },
                { provide: CommandBus, useValue: {} },
                { provide: CopilotService, useValue: connections },
                { provide: CopilotRoleDefaultService, useValue: defaults },
                { provide: PrimaryModelSmokeService, useValue: {} },
                { provide: MembershipService, useValue: {} },
                { provide: ConfigService, useValue: { get: () => 'http://localhost' } }
            ]
        })
            .overrideGuard(PermissionGuard)
            .useValue({ canActivate: () => allowed })
            .compile()
        app = module.createNestApplication()
        await app.listen(0, '127.0.0.1')
        url = await app.getUrl()
    })
    beforeEach(() => {
        jest.resetAllMocks()
        allowed = true
        queries.execute.mockResolvedValue(null)
        defaults.setupConnection.mockResolvedValue(null)
    })
    afterAll(async () => {
        await app?.close()
    })
    it.each(DEFAULT_MODEL_DEFINITIONS)(
        'resolves the $role purpose through the canonical and compatible URL',
        async ({ role }) => {
            for (const prefix of ['default-models', 'availables']) {
                expect((await fetch(`${url}/${prefix}/${role}`)).status).toBe(200)
                expect(queries.execute).toHaveBeenLastCalledWith(expect.any(ResolveDefaultModelQuery))
                expect(queries.execute).toHaveBeenLastCalledWith(expect.objectContaining({ role }))
            }
        }
    )
    it('rejects model types and unknown roles at the HTTP boundary', async () => {
        for (const role of ['llm', 'text-embedding', 'unknown']) {
            expect((await fetch(`${url}/default-models/${role}`)).status).toBe(400)
            expect((await fetch(`${url}/default-models/${role}/setup`, { method: 'POST' })).status).toBe(400)
        }
        expect(queries.execute).not.toHaveBeenCalled()
        expect(defaults.setupConnection).not.toHaveBeenCalled()
    })
    it('does not widen the old connection enable API to new purposes', async () => {
        expect((await fetch(`${url}/enable/realtime`, { method: 'POST' })).status).toBe(400)
        expect((await fetch(`${url}/disable/image`, { method: 'POST' })).status).toBe(400)
        expect(connections.enableRole).not.toHaveBeenCalled()
        expect(connections.update).not.toHaveBeenCalled()
    })
    it('protects credential setup with edit permission', async () => {
        allowed = false
        expect((await fetch(`${url}/default-models/primary/setup`)).status).toBe(403)
        expect((await fetch(`${url}/default-models/primary/setup`, { method: 'POST' })).status).toBe(403)
        expect(defaults.setupConnection).not.toHaveBeenCalled()
    })
    it('returns setup identity without credentials and enables its assigned connection by ID', async () => {
        defaults.setupConnection.mockResolvedValue({
            id: 'owned-connection',
            role: 'embedding',
            enabled: false,
            apiKey: 'synthetic-private',
            secretKey: 'synthetic-private',
            modelProvider: { id: 'provider', providerName: 'test', credentials: { api_key: 'synthetic-private' } }
        })
        const response = await fetch(`${url}/default-models/primary/setup`, { method: 'POST' })
        expect(response.status).toBe(201)
        expect(await response.json()).toEqual({
            id: 'owned-connection',
            role: 'embedding',
            enabled: false,
            modelProvider: { id: 'provider', providerName: 'test' }
        })
        expect(connections.update).toHaveBeenCalledWith('owned-connection', { enabled: true })
        expect(connections.enableRole).not.toHaveBeenCalled()
    })
    it('prepares only the existing legacy credential-first placeholder when no assignment exists', async () => {
        expect((await fetch(`${url}/default-models/primary/setup`, { method: 'POST' })).status).toBe(201)
        expect(connections.enableRole).toHaveBeenCalledWith('primary')
        connections.enableRole.mockClear()
        expect((await fetch(`${url}/default-models/realtime/setup`, { method: 'POST' })).status).toBe(400)
        expect(connections.enableRole).not.toHaveBeenCalled()
    })
})
