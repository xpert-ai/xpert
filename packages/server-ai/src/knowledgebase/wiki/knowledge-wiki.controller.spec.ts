import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { KnowledgeWikiController } from './knowledge-wiki.controller'
import { KnowledgeWikiService } from './knowledge-wiki.service'

describe('Wiki page query HTTP boundary', () => {
    let app: INestApplication
    const listPages = jest.fn().mockResolvedValue({ items: [], total: 0 })
    const knowledgebaseId = '4dbe5720-6a67-492f-b9b9-13dd89f155df'
    let url: string

    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [KnowledgeWikiController],
            providers: [{ provide: KnowledgeWikiService, useValue: { listPages } }]
        }).compile()
        app = module.createNestApplication()
        await app.listen(0, '127.0.0.1')
        url = `${await app.getUrl()}/${knowledgebaseId}/wiki/pages`
    })
    afterEach(() => listPages.mockClear())
    afterAll(async () => app?.close())

    it('converts the browser pagination strings before invoking the service', async () => {
        const response = await fetch(`${url}?skip=0&take=50`)
        expect(response.status).toBe(200)
        expect(listPages).toHaveBeenCalledWith(knowledgebaseId, expect.objectContaining({ skip: 0, take: 50 }))
    })

    it('accepts omitted optional pagination', async () => {
        expect((await fetch(url)).status).toBe(200)
        expect(listPages).toHaveBeenCalledTimes(1)
    })

    it.each(['skip=-1', 'take=0', 'take=101', 'take=abc', 'take=1.5', 'pageType=invalid'])(
        'rejects invalid query %s without executing a list query',
        async (query) => {
            expect((await fetch(`${url}?${query}`)).status).toBe(400)
            expect(listPages).not.toHaveBeenCalled()
        }
    )
})
