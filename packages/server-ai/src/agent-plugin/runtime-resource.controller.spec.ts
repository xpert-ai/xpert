import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { ApiKeyOrClientSecretAuthGuard } from '@xpert-ai/server-core'
import { RuntimeResourceController } from './runtime-resource.controller'

describe('runtime resource catalog HTTP query', () => {
    const service = { catalog: jest.fn() }
    let app: INestApplication
    let url: string

    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [RuntimeResourceController],
            providers: [{ provide: 'XpertRuntimeResourceService', useValue: service }]
        })
            .overrideGuard(ApiKeyOrClientSecretAuthGuard)
            .useValue({ canActivate: () => true })
            .compile()
        app = module.createNestApplication({ logger: false })
        await app.listen(0, '127.0.0.1')
        url = `${await app.getUrl()}/assistants/assistant/resources`
    })
    afterAll(async () => app?.close())
    beforeEach(() => {
        jest.clearAllMocks()
        service.catalog.mockResolvedValue({ items: [], total: 0 })
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
})
