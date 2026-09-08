import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { KnowledgeWikiController } from './knowledge-wiki.controller'
import { KnowledgeWikiService } from './knowledge-wiki.service'

describe('Wiki document status HTTP boundary', () => {
    let app: INestApplication
    let url: string
    const knowledgebaseId = '4dbe5720-6a67-492f-b9b9-13dd89f155df'
    const documentId = '8eca8cb3-a668-4714-bf28-12df751a1d5e'
    const getDocumentStatus = jest.fn().mockResolvedValue({ indexedDocumentIds: [documentId] })

    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [KnowledgeWikiController],
            providers: [{ provide: KnowledgeWikiService, useValue: { getDocumentStatus } }]
        }).compile()
        app = module.createNestApplication()
        await app.listen(0, '127.0.0.1')
        url = `${await app.getUrl()}/${knowledgebaseId}/wiki/documents/status`
    })
    afterEach(() => getDocumentStatus.mockClear())
    afterAll(async () => app?.close())

    it('reads document status in one bounded knowledgebase-scoped request', async () => {
        const response = await fetch(`${url}?documentIds=${documentId}`)
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ indexedDocumentIds: [documentId] })
        expect(getDocumentStatus).toHaveBeenCalledWith(knowledgebaseId, [documentId])
    })

    it.each(['', '?documentIds=', '?documentIds=invalid', '?documentIds=' + Array(101).fill(documentId).join(',')])(
        'rejects missing, malformed or unbounded document ids: %s',
        async (query) => {
            expect((await fetch(url + query)).status).toBe(400)
            expect(getDocumentStatus).not.toHaveBeenCalled()
        }
    )
})
