import { BadRequestException } from '@nestjs/common'
import { DataSource } from 'typeorm'
import {
    KNOWLEDGE_DOCUMENT_NAME_TRIGRAM_INDEX,
    KNOWLEDGE_KEYWORD_FTS_INDEX,
    KNOWLEDGE_KEYWORD_TRIGRAM_INDEX,
    KnowledgeKeywordIndexService
} from './knowledge-keyword-index.service'

type QueryMock = jest.Mock<Promise<unknown[]>, [string, unknown[]?]>

function dataSource(query: QueryMock, type: 'postgres' | 'sqlite' = 'postgres') {
    return { options: { type }, query } as unknown as DataSource
}

describe('KnowledgeKeywordIndexService', () => {
    it('reports all required indexes and only caches a ready result', async () => {
        const query = jest
            .fn<Promise<unknown[]>, [string, unknown[]?]>()
            .mockResolvedValueOnce([{ fullTextReady: false, trigramReady: true, documentNameTrigramReady: true }])
            .mockResolvedValueOnce([{ fullTextReady: true, trigramReady: true, documentNameTrigramReady: true }])
        const service = new KnowledgeKeywordIndexService(dataSource(query))

        await expect(service.status()).resolves.toEqual({
            fullTextReady: false,
            trigramReady: true,
            documentNameTrigramReady: true,
            ready: false
        })
        await expect(service.status()).resolves.toEqual({
            fullTextReady: true,
            trigramReady: true,
            documentNameTrigramReady: true,
            ready: true
        })
        await expect(service.status()).resolves.toEqual({
            fullTextReady: true,
            trigramReady: true,
            documentNameTrigramReady: true,
            ready: true
        })

        expect(query).toHaveBeenCalledTimes(2)
        expect(query.mock.calls[0][1]).toEqual([
            `"${KNOWLEDGE_KEYWORD_FTS_INDEX}"`,
            `"${KNOWLEDGE_KEYWORD_TRIGRAM_INDEX}"`,
            `"${KNOWLEDGE_DOCUMENT_NAME_TRIGRAM_INDEX}"`
        ])
        expect(query.mock.calls[0][0]).toContain('indisready')
        expect(query.mock.calls[0][0]).toContain('indisvalid')
    })

    it('rejects unsupported database engines before executing SQL', async () => {
        const query = jest.fn<Promise<unknown[]>, [string, unknown[]?]>()
        const service = new KnowledgeKeywordIndexService(dataSource(query, 'sqlite'))

        await expect(service.status()).rejects.toBeInstanceOf(BadRequestException)
        expect(query).not.toHaveBeenCalled()
    })
})
