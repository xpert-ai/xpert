jest.mock('../agent-plugin-installations.service', () => ({ AgentPluginInstallationsService: class {} }))
import { AgentPluginInstallationsService } from '../agent-plugin-installations.service'
import { Test } from '@nestjs/testing'
import { CommandBus } from '@nestjs/cqrs'
import type { INestApplication } from '@nestjs/common'
import { AgentPluginController } from '../agent-plugin.controller'
import { ImportDefaultAgentPluginsCommand } from '@xpert-ai/plugin-sdk'

describe('default Agent plugins HTTP boundary', () => {
    let app: INestApplication
    let url: string
    const execute = jest.fn(async () => ({ commit: 'fixed', items: [] }))
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
                { provide: CommandBus, useValue: { execute } }
            ]
        }).compile()
        app = module.createNestApplication({ logger: false })
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
    it('uses only the shared default-import command', async () => {
        const response = await post({})
        expect(response.status).toBe(201)
        expect(await response.json()).toEqual({ commit: 'fixed', items: [] })
        expect(execute).toHaveBeenCalledWith(expect.any(ImportDefaultAgentPluginsCommand))
    })
    it.each([{ url: 'https://evil.example' }, { organizationId: 'other' }, { workspaceIds: ['workspace'] }])(
        'rejects source, scope and publication overrides',
        async (input) => {
            execute.mockClear()
            expect((await post(input)).status).toBe(400)
            expect(execute).not.toHaveBeenCalled()
        }
    )
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
