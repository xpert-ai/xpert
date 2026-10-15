jest.mock('../agent-plugin-installations.service', () => ({ AgentPluginInstallationsService: class {} }))
import { AgentPluginInstallationsService } from '../agent-plugin-installations.service'
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import { AgentPluginController } from '../agent-plugin.controller'
import { DefaultAgentPluginsService } from './default-agent-plugins.service'
jest.mock('./default-agent-plugins.service', () => ({ DefaultAgentPluginsService: class {} }))

describe('default Agent plugins HTTP boundary', () => {
    let app: INestApplication
    let url: string
    const progress = {
        operationId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        phase: 'fetching',
        commit: null,
        total: 0,
        currentId: null,
        items: [],
        updatedAt: new Date().toISOString()
    }
    const start = jest.fn(async (_input: object) => progress)
    const status = jest.fn(async () => progress)
    const createBinding = jest.fn(async (input) => input)
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [AgentPluginController],
            providers: [
                {
                    provide: AgentPluginInstallationsService,
                    useValue: { catalog: jest.fn(async () => ({ items: [] })) }
                },
                { provide: 'XpertAgentPluginService', useValue: { createBinding } },
                { provide: DefaultAgentPluginsService, useValue: { start, status } }
            ]
        }).compile()
        app = module.createNestApplication({ logger: false })
        app.use((request: { i18nContext?: { lang: string } }, _response: unknown, next: () => void) => {
            request.i18nContext = { lang: 'en' }
            next()
        })
        await app.listen(0, '127.0.0.1')
        url = await app.getUrl()
    })
    afterAll(async () => {
        await app.close()
    })
    const post = (body: object) =>
        fetch(`${url}/agent-plugins/defaults`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
    it('returns an accepted receipt and exposes progress without waiting for imports', async () => {
        const response = await post({})
        expect(response.status).toBe(202)
        expect(await response.json()).toEqual(progress)
        expect(start).toHaveBeenCalledWith({})
        const query = await fetch(`${url}/agent-plugins/defaults`)
        expect(query.status).toBe(200)
        expect(await query.json()).toEqual(progress)
        expect((await post({ operationId: progress.operationId })).status).toBe(202)
        expect(start).toHaveBeenLastCalledWith({ operationId: progress.operationId })
    })
    it.each([
        { url: 'https://evil.example' },
        { organizationId: 'other' },
        { workspaceIds: ['workspace'] },
        { operationId: 'invalid' }
    ])('rejects source, scope and publication overrides', async (input) => {
        start.mockClear()
        expect((await post(input)).status).toBe(400)
        expect(start).not.toHaveBeenCalled()
    })
    it('serves the installation catalog without a workspace parameter', async () => {
        const response = await fetch(`${url}/agent-plugins/catalog`)
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ items: [] })
    })
    it('accepts configuration without workspace targets and rejects forged scope fields', async () => {
        const input = {
            title: 'Documents',
            definition: {
                kind: 'agent_plugin',
                packageId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
                availability: 'scope'
            }
        }
        const configure = (body: object) =>
            fetch(`${url}/agent-plugins/bindings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            })
        expect((await configure(input)).status).toBe(201)
        expect(createBinding).toHaveBeenLastCalledWith({
            ...input,
            workspaceIds: [],
            definition: { ...input.definition, experts: {} }
        })
        createBinding.mockClear()
        expect((await configure({ ...input, tenantId: 'foreign' })).status).toBe(400)
        expect((await configure({ ...input, definition: { ...input.definition, availability: 'other' } })).status).toBe(
            400
        )
        expect(createBinding).not.toHaveBeenCalled()
    })
})
