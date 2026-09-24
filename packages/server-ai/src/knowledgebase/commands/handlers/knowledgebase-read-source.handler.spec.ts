jest.mock('../../../knowledge-document/document.service', () => ({ KnowledgeDocumentService: class {} }))
import { Document } from '@langchain/core/documents'
import { CommandBus } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/server-core'
import type { ChunkMetadata } from '@xpert-ai/plugin-sdk'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { KnowledgeDocument } from '../../../knowledge-document/document.entity'
import type { KnowledgeDocumentService } from '../../../knowledge-document/document.service'
import { resolveKnowledgeDocumentTransformerIdentity } from '../../../knowledge-document/document-hash'
import { KnowledgeDocumentTransformSnapshotService } from '../../../knowledge-document/transform-snapshot.service'
import { guardEmbeddingInputDocuments } from '../../../knowledge-document/embedding-input-guard'
import { ReadKnowledgebaseDocumentSourceHandler } from './knowledgebase-read-source.handler'
import { ReadKnowledgebaseDocumentSourceCommand } from '../knowledgebase-documents.command'
import { KnowledgebaseDocumentsRuntimeService } from '../../runtime/knowledgebase-documents-runtime.service'

describe('governed pre-split source reading', () => {
    let root: string
    let snapshots: KnowledgeDocumentTransformSnapshotService
    const table = [
        '| No. | Product name | Model | Quantity(unit) |',
        ...Array.from({ length: 4 }, (_, i) => `| ${i + 1} | Automotive motor | AUTO-MOTOR-${i + 1} | 2 |`)
    ].join('\n')

    beforeEach(async () => {
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'knowledge-source-test-'))
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
        snapshots = new KnowledgeDocumentTransformSnapshotService({
            resolve: async () => ({
                volume: { path: (value) => path.join(root, value) },
                statePath: { relativePath: '.knowledge' }
            })
        })
    })

    afterEach(async () => {
        jest.restoreAllMocks()
        await fs.rm(root, { recursive: true, force: true })
    })

    async function fixture(texts = [table]) {
        const document = Object.assign(new KnowledgeDocument(), {
            id: 'doc',
            knowledgebaseId: 'kb',
            sourceHash: 'file-v1',
            version: 1,
            type: 'pdf',
            sourceKey: 'automotive-contract',
            parserConfig: { transformerType: 'default' }
        })
        const chunks = texts.map(
            (pageContent, index) =>
                new Document<ChunkMetadata>({
                    pageContent,
                    metadata: { chunkId: `converted-${index}`, page: index + 1 }
                })
        )
        document.metadata = {
            transformSnapshot: await snapshots.save(
                document,
                [{ chunks }],
                resolveKnowledgeDocumentTransformerIdentity(document)
            )
        }
        const documents = {
            assertDocumentReadAccess: jest
                .fn<
                    ReturnType<KnowledgeDocumentService['assertDocumentReadAccess']>,
                    Parameters<KnowledgeDocumentService['assertDocumentReadAccess']>
                >()
                .mockResolvedValue(undefined),
            findOne: jest
                .fn<ReturnType<KnowledgeDocumentService['findOne']>, Parameters<KnowledgeDocumentService['findOne']>>()
                .mockResolvedValue(document),
            getChunks: jest.fn()
        }
        return {
            document,
            documents,
            chunks,
            handler: new ReadKnowledgebaseDocumentSourceHandler(documents, snapshots)
        }
    }

    it('returns identical complete evidence across embedding budgets, chunk settings and index versions', async () => {
        const f = await fixture()
        const input = { knowledgebaseId: 'kb', documentId: 'doc' }
        const original = await f.handler.execute({ input })
        expect(original.chunks).toEqual([{ id: 'source-0-0', text: table, page: 1 }])
        const sizes = new Set<number>()
        for (const contextSize of [24, 64, 512, 8192]) {
            const indexed = guardEmbeddingInputDocuments(f.chunks, contextSize)
            sizes.add(indexed.length)
            f.documents.getChunks.mockResolvedValue({ items: indexed, total: indexed.length })
            f.document.version++
            f.document.parserConfig = { ...f.document.parserConfig, chunkSize: contextSize, chunkOverlap: 10 }
            expect(await f.handler.execute({ input })).toEqual(original)
        }
        expect(sizes.size).toBeGreaterThan(1)
        expect(f.documents.getChunks).not.toHaveBeenCalled()
    })

    it('pages by complete converter blocks and pins the content revision', async () => {
        const f = await fixture([table, 'Automotive requirements', table])
        const input = { knowledgebaseId: 'kb', documentId: 'doc', limit: 1 }
        const first = await f.handler.execute({ input })
        const next = await f.handler.execute({ input: { ...input, offset: 1, revision: first.revision } })
        expect(first.total).toBe(3)
        expect(next.chunks).toEqual([{ id: 'source-0-1', text: 'Automotive requirements', page: 2 }])
        expect(next.revision).toBe(first.revision)
        await expect(f.handler.execute({ input: { ...input, revision: 'obsolete' } })).rejects.toMatchObject({
            status: 409
        })
    })

    it('routes the public runtime capability to the source command', async () => {
        const f = await fixture(),
            input = { knowledgebaseId: 'kb', documentId: 'doc' }
        const expected = await f.handler.execute({ input })
        const bus = new CommandBus(undefined!)
        const execute = jest.spyOn(bus, 'execute').mockResolvedValue(expected)
        expect(await new KnowledgebaseDocumentsRuntimeService(bus).readSource(input)).toEqual(expected)
        expect(execute).toHaveBeenCalledWith(new ReadKnowledgebaseDocumentSourceCommand(input))
    })

    it('checks access and knowledgebase membership before opening the snapshot', async () => {
        const f = await fixture(),
            load = jest.spyOn(snapshots, 'load')
        f.documents.assertDocumentReadAccess.mockRejectedValueOnce(new Error('denied'))
        await expect(f.handler.execute({ input: { knowledgebaseId: 'kb', documentId: 'doc' } })).rejects.toThrow(
            'denied'
        )
        await expect(
            f.handler.execute({ input: { knowledgebaseId: 'another-kb', documentId: 'doc' } })
        ).rejects.toMatchObject({ status: 400 })
        expect(load).not.toHaveBeenCalled()
    })

    it.each(['missing', 'stale', 'corrupt'] as const)(
        'rejects %s evidence without falling back to index chunks',
        async (problem) => {
            const f = await fixture()
            if (problem === 'missing') f.document.metadata = {}
            if (problem === 'stale') f.document.sourceHash = 'different-file'
            if (problem === 'corrupt')
                await fs.appendFile(path.join(root, f.document.metadata.transformSnapshot.filePath), 'damaged')
            await expect(
                f.handler.execute({ input: { knowledgebaseId: 'kb', documentId: 'doc' } })
            ).rejects.toMatchObject({ code: problem })
            expect(f.documents.getChunks).not.toHaveBeenCalled()
        }
    )
})
