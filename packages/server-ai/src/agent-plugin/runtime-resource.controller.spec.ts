import { RuntimeResourceCommandsService } from './commands/runtime-resource-commands.service'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { ApiKeyOrClientSecretAuthGuard } from '@xpert-ai/server-core'
import { RuntimeResourceController } from './runtime-resource.controller'

describe('runtime resource catalog HTTP query', () => {
    const service = { catalog: jest.fn() }
    const commands = { list: jest.fn() }
    const guard = { canActivate: jest.fn(() => true) }
    let app: INestApplication
    let url: string

    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [RuntimeResourceController],
            providers: [
                { provide: 'XpertRuntimeResourceService', useValue: service },
                { provide: RuntimeResourceCommandsService, useValue: commands }
            ]
        })
            .overrideGuard(ApiKeyOrClientSecretAuthGuard)
            .useValue(guard)
            .compile()
        app = module.createNestApplication({ logger: false })
        await app.listen(0, '127.0.0.1')
        url = `${await app.getUrl()}/assistants/assistant/resources`
    })
    afterAll(async () => app?.close())
    beforeEach(() => {
        jest.clearAllMocks()
        service.catalog.mockResolvedValue({ items: [], total: 0 })
        commands.list.mockResolvedValue([])
        guard.canActivate.mockReturnValue(true)
    })

    it('keeps legacy requests in browse mode with existing pagination defaults', async () => {
        expect((await fetch(url)).status).toBe(200)
        expect(service.catalog).toHaveBeenCalledWith('assistant', { offset: 0, limit: 50 })
    })
    it.each(['browse', 'selection'])('accepts purpose=%s without changing the Assistant scope', async (purpose) => {
        expect((await fetch(`${url}?purpose=${purpose}&offset=1&limit=10`)).status).toBe(200)
        expect(service.catalog).toHaveBeenCalledWith('assistant', { purpose, offset: 1, limit: 10 })
    })
    it.each(['purpose=all', 'purpose=', 'purpose=selection&userId=other', 'purpose=selection&limit=101'])(
        'rejects invalid query %s before catalog access',
        async (query) => {
            expect((await fetch(`${url}?${query}`)).status).toBe(400)
            expect(service.catalog).not.toHaveBeenCalled()
        }
    )

    const selection = {
        revision: 0,
        resources: [{ bindingId: '11111111-1111-4111-8111-111111111111', version: 'a'.repeat(64) }]
    }
    const post = (body: unknown) =>
        fetch(`${url}/commands`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body)
        })
    it('validates command discovery and preserves the exact project and resource scope', async () => {
        const projectId = '22222222-2222-4222-8222-222222222222'
        expect((await post({ runtimeResources: selection, projectId })).status).toBe(201)
        expect(commands.list).toHaveBeenCalledWith('assistant', selection, projectId)
    })
    it.each([
        {},
        { runtimeResources: selection, projectId: 'invalid' },
        { runtimeResources: selection, workspaceId: 'override' },
        { runtimeResources: { ...selection, resources: [{ ...selection.resources[0], version: 'latest' }] } },
        { runtimeResources: { ...selection, resources: [...selection.resources, ...selection.resources] } }
    ])('rejects malformed command discovery before resource access', async (body) => {
        expect((await post(body)).status).toBe(400)
        expect(commands.list).not.toHaveBeenCalled()
    })
    it('requires the shared Assistant authentication guard for command discovery', async () => {
        guard.canActivate.mockReturnValue(false)
        expect((await post({ runtimeResources: selection })).status).toBe(403)
        expect(commands.list).not.toHaveBeenCalled()
    })
})
