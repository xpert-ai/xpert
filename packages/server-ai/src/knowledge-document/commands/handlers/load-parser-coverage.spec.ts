jest.mock('i18next', () => ({ t: (_key: string, options: { defaultValue: string }) => options.defaultValue }))
import { Document } from '@langchain/core/documents'
import { IKnowledgeDocument } from '@xpert-ai/contracts'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { KnowledgeDocLoadCommand } from '../load.command'
import { KnowledgebaseService } from '../../../knowledgebase/knowledgebase.service'
import { KnowledgeDocLoadHandler } from './load.handler'
import { RecursiveCharacterStrategy } from '../../../knowledgebase/plugins/textsplitter-common/recursive-character.strategy'

function fixture(mixed: boolean, enabled: boolean, recognized: boolean) {
    const asset = {
        type: 'image',
        sourceType: 'pdf_page',
        page: 2,
        filePath: 'page2.png',
        url: 'https://files.test/page2.png'
    }
    const transformed = {
        chunks: [
            new Document({
                pageContent: (mixed ? 'PAGE1-NATIVE-471\n' : '') + '![page](https://files.test/page2.png)',
                metadata: { chunkId: 'source', contentFormat: 'markdown', page: 2 }
            })
        ],
        metadata: {
            assets: [asset],
            parserDiagnostics: {
                schemaVersion: 1,
                pages: [
                    ...(mixed ? [{ page: 1, status: 'text', imagePaths: [] }] : []),
                    { page: 2, status: 'needs-ocr', imagePaths: ['page2.png'] }
                ]
            }
        }
    }
    const understandImages = jest.fn(async () => ({
        chunks: [
            ...transformed.chunks,
            ...(recognized
                ? [
                      new Document({
                          pageContent: 'PAGE2-SCAN-862 385.50 '.repeat(80),
                          metadata: {
                              chunkId: 'ocr',
                              parser: 'vlm',
                              sourceType: 'pdf_page',
                              page: 2,
                              imagePath: 'page2.png'
                          }
                      })
                  ]
                : [])
        ]
    }))
    const handler = new KnowledgeDocLoadHandler(
        {} as KnowledgebaseService,
        { execute: async () => ({}) } as unknown as CommandBus,
        {} as QueryBus
    )
    Object.assign(handler, {
        knowledgeWorkAreaResolver: { resolve: async () => ({ volume: {}, tmpPath: { serverPath: '/tmp' } }) },
        transformerRegistry: {
            get: () => ({
                permissions: [],
                meta: { name: 'markitdown', supportedFileTypes: ['pdf'], providesImageText: false },
                transformDocuments: async () => [transformed]
            })
        },
        imageUnderstandingRegistry: {
            get: () => ({ permissions: [], requiresVisionModel: () => false, understandImages })
        },
        textSplitterRegistry: { get: () => new RecursiveCharacterStrategy() },
        cacheManager: { get: async () => undefined, set: async () => undefined }
    })
    const doc = {
        id: 'doc',
        name: 'sample.pdf',
        type: 'pdf',
        filePath: 'sample.pdf',
        knowledgebaseId: 'kb',
        parserConfig: {
            transformerType: 'markitdown',
            imageUnderstandingEnabled: enabled,
            imageUnderstandingType: 'vlm-default',
            textSplitterType: 'recursive-character',
            chunkSize: 200,
            chunkOverlap: 0
        }
    } as IKnowledgeDocument
    return {
        handler,
        doc,
        understandImages,
        run: () => handler.execute(new KnowledgeDocLoadCommand({ doc, stage: 'test' }))
    }
}
it('does not report a pure scan as complete when OCR is disabled or fails', async () => {
    for (const enabled of [false, true]) {
        const f = fixture(false, enabled, false)
        await expect(f.run()).rejects.toThrow('No text was recognized')
        expect(f.doc.metadata.parserDiagnostics.pages[0].status).toBe('needs-ocr')
        expect(f.understandImages).toHaveBeenCalledTimes(enabled ? 1 : 0)
    }
})
it('retains native text but records the missing scan page on mixed PDFs', async () => {
    const f = fixture(true, false, false)
    const result = await f.run()
    expect(result.chunks.map((chunk) => chunk.pageContent).join('')).toContain('PAGE1-NATIVE-471')
    expect(f.doc.metadata.parserDiagnostics.pages[1].status).toBe('needs-ocr')
})
it('records a scanned page as recognized when OCR returns text', async () => {
    const f = fixture(false, true, true)
    const result = await f.run()
    expect(result.chunks.map((chunk) => chunk.pageContent).join('')).toContain('PAGE2-SCAN-862')
    expect(f.doc.metadata.parserDiagnostics.pages[0].status).toBe('recognized')
})
