import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { ChatConversationSidebarController } from './conversation-sidebar.controller'
import { ChatConversationSidebarService } from './conversation-sidebar.service'

const assistantId = '66d1b8ed-e8fc-4df0-a30a-717d291cdd21'

describe('sidebar conversation search HTTP boundary', () => {
    let app: INestApplication
    let baseUrl: string
    const get = (query: string) => fetch(`${baseUrl}/my/sidebar?${query}`)
    const list = jest.fn(async () => ({ items: [], total: 0 }))
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [ChatConversationSidebarController],
            providers: [{ provide: ChatConversationSidebarService, useValue: { list } }]
        }).compile()
        app = module.createNestApplication()
        await app.listen(0, '127.0.0.1')
        baseUrl = await app.getUrl()
    })
    afterAll(() => app.close())
    beforeEach(() => list.mockClear())

    it('preserves old requests with an empty search and existing pagination defaults', async () => {
        expect((await get(`xpertId=${assistantId}`)).status).toBe(200)
        expect(list).toHaveBeenCalledWith(assistantId, 10, 0, false, '')
    })
    it('trims search and validates archived/pagination before dispatch', async () => {
        expect((await get(`xpertId=${assistantId}&search=%20title%20&archived=true&take=20&skip=40`)).status).toBe(200)
        expect(list).toHaveBeenCalledWith(assistantId, 20, 40, true, 'title')
    })
    it('rejects repeated or oversized search values instead of passing unchecked query objects', async () => {
        expect((await get(`xpertId=${assistantId}&search=a&search=b`)).status).toBe(400)
        expect((await get(`xpertId=${assistantId}&search=${'a'.repeat(201)}`)).status).toBe(400)
        expect(list).not.toHaveBeenCalled()
    })
})
