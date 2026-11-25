import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { WorkbenchNavigationController } from './workbench-navigation.controller'
import { AssistantWorkbenchEntryQuery } from './queries/assistant-workbench-entry.query'

describe('Workbench navigation HTTP input boundary', () => {
    const assistantId = '11111111-1111-4111-8111-111111111111'
    const queries = { execute: jest.fn() }
    let app: INestApplication, origin: string
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [WorkbenchNavigationController],
            providers: [{ provide: QueryBus, useValue: queries }]
        }).compile()
        app = module.createNestApplication({ logger: false })
        await app.listen(0, '127.0.0.1')
        origin = await app.getUrl()
    })
    beforeEach(() => jest.clearAllMocks())
    afterAll(() => app.close())
    const send = (body: object) =>
        fetch(`${origin}/${assistantId}/workbench-navigation`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body)
        })
    it('dispatches a typed query with only the requested View location', async () => {
        const location = {
            projectId: null,
            viewKey: 'orders__review',
            selectionId: 'order-42',
            parameters: { tab: 'evidence', pages: [1, 2] }
        }
        queries.execute.mockResolvedValue({ available: true })
        const response = await send(location)
        expect(response.status).toBe(201)
        expect(response.headers.get('cache-control')).toBe('no-store')
        expect(queries.execute).toHaveBeenCalledWith(new AssistantWorkbenchEntryQuery(assistantId, location))
    })
    it.each([
        { tenantId: 'injected' },
        { organizationId: 'injected' },
        { assistantId: 'injected' },
        { url: 'https://external.example' },
        { commandKey: 'approve' },
        { projectId: undefined },
        { projectId: 'invalid' },
        { parameters: { nested: { id: 'x' } } },
        { parameters: { huge: 'x'.repeat(4001) } }
    ])('rejects unsupported fields, missing scope and unbounded View input: %p', async (invalid) => {
        expect((await send({ projectId: null, viewKey: 'orders__review', ...invalid })).status).toBe(400)
        expect(queries.execute).not.toHaveBeenCalled()
    })
})
