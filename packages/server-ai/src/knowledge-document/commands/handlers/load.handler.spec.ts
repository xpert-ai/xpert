import { Document } from '@langchain/core/documents'
import { KnowledgeDocLoadHandler } from './load.handler'

describe('KnowledgeDocLoadHandler', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('uses the default text splitter when parserConfig is null', async () => {
        const handler = new KnowledgeDocLoadHandler({} as any, {} as any, {} as any)
        const chunks = [
            new Document({
                pageContent: 'A short PDF page.',
                metadata: {
                    page: 1
                }
            }) as any
        ]
        const splitDocuments = jest.fn(async () => ({ chunks }))
        const textSplitterRegistry = {
            get: jest.fn(() => ({ splitDocuments }))
        }
        ;(handler as any).textSplitterRegistry = textSplitterRegistry

        const result = await handler.splitDocuments(
            {
                id: 'doc-1',
                parserConfig: null
            } as any,
            chunks
        )

        expect(textSplitterRegistry.get).toHaveBeenCalledWith('recursive-character')
        expect(splitDocuments).toHaveBeenCalledWith(
            chunks,
            expect.objectContaining({
                chunkSize: 1000,
                chunkOverlap: 200,
                separators: '\\n\\n,\\n, ,'
            })
        )
        expect(result).toEqual({ chunks })
    })
})
