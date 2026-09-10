import { QueryFailedError, Repository } from 'typeorm'
import { KnowledgeDocumentChunk } from '../../knowledge-document/chunk/chunk.entity'
import { KnowledgeDocument } from '../../knowledge-document/document.entity'
import { KnowledgeDocumentService } from '../../knowledge-document/document.service'
import { Knowledgebase } from '../knowledgebase.entity'
import { KnowledgebaseService } from '../knowledgebase.service'
import { KnowledgeWikiPage, KnowledgeWikiPageVersion, KnowledgeWikiProjectionState } from './entities'
import { KnowledgeWikiProjectionService } from './knowledge-wiki-projection.service'

describe('KnowledgeWikiProjectionService', () => {
    function createStageFixture() {
        const chunks = new Map<string, KnowledgeDocumentChunk>()
        const chunkRepository = {
            create: (value: Partial<KnowledgeDocumentChunk>) => Object.assign(new KnowledgeDocumentChunk(), value),
            save: jest.fn(async (chunk: KnowledgeDocumentChunk) => {
                if (chunks.has(chunk.id))
                    throw new QueryFailedError('INSERT', [], Object.assign(new Error('duplicate'), { code: '23505' }))
                chunks.set(chunk.id, chunk)
                return chunk
            }),
            findOne: async ({ where }: { where: { id: string } }) => chunks.get(where.id)
        }
        const addKnowledgeDocument = jest.fn().mockResolvedValue(undefined)
        const version = Object.assign(new KnowledgeWikiPageVersion(), {
            id: 'version',
            title: 'Team',
            summary: 'Ownership',
            contentMarkdown: 'Maintains the service.',
            generationRevision: 1,
            status: 'building',
            projectionStatus: 'pending'
        })
        const document = Object.assign(new KnowledgeDocument(), { id: 'document', chunks: [] })
        const service = new KnowledgeWikiProjectionService(
            { findOne: async () => document } as unknown as Repository<KnowledgeDocument>,
            chunkRepository as unknown as Repository<KnowledgeDocumentChunk>,
            {
                save: async (value: KnowledgeWikiPageVersion) => value
            } as unknown as Repository<KnowledgeWikiPageVersion>,
            {
                findOne: async () => ({ projectionDocumentId: document.id })
            } as unknown as Repository<KnowledgeWikiProjectionState>,
            {} as KnowledgeDocumentService,
            { getActiveVectorStore: async () => ({ addKnowledgeDocument }) } as unknown as KnowledgebaseService
        )
        const knowledgebase = Object.assign(new Knowledgebase(), { id: 'kb' })
        const page = Object.assign(new KnowledgeWikiPage(), { id: 'page', pageKey: 'entity:team', pageType: 'entity' })
        return { service, knowledgebase, page, version, chunks, addKnowledgeDocument }
    }

    it('reuses the physical chunk after another attempt already persisted the same Wiki version', async () => {
        const { service, knowledgebase, page, version, chunks, addKnowledgeDocument } = createStageFixture()
        await service.stage(knowledgebase, page, version)
        await service.stage(knowledgebase, page, version)
        expect(chunks.size).toBe(1)
        expect(addKnowledgeDocument.mock.calls[0][1][0].id).toBe(addKnowledgeDocument.mock.calls[1][1][0].id)
        expect(version.projectionStatus).toBe('ready')
    })

    it('resumes a failed vector write without deleting or duplicating its relational chunk', async () => {
        const { service, knowledgebase, page, version, chunks, addKnowledgeDocument } = createStageFixture()
        addKnowledgeDocument.mockRejectedValueOnce(new Error('temporary vector failure'))
        await expect(service.stage(knowledgebase, page, version)).rejects.toMatchObject({
            code: 'knowledge_wiki_index_failed'
        })
        expect(version.projectionError).toBe('temporary vector failure')
        await service.stage(knowledgebase, page, version)
        expect(chunks.size).toBe(1)
        expect(version).toMatchObject({ projectionStatus: 'ready', projectionError: null })
    })

    it('removes only physical chunks for the retired Wiki versions', async () => {
        const deleteChunks = jest.fn()
        const chunkRepository = {
            find: jest.fn().mockResolvedValue([
                {
                    id: 'chunk-retired',
                    metadata: {
                        chunkId: 'wiki:page-1:version-1:root',
                        contentKind: 'wiki',
                        wikiPageId: 'page-1',
                        wikiPageVersionId: 'version-1',
                        wikiPageKey: 'entity:xpert',
                        wikiPageType: 'entity',
                        wikiRevision: 2,
                        sectionAnchor: 'root',
                        projectionStatus: 'ready'
                    }
                },
                {
                    id: 'chunk-current',
                    metadata: {
                        chunkId: 'wiki:page-1:version-2:root',
                        contentKind: 'wiki',
                        wikiPageId: 'page-1',
                        wikiPageVersionId: 'version-2',
                        wikiPageKey: 'entity:xpert',
                        wikiPageType: 'entity',
                        wikiRevision: 3,
                        sectionAnchor: 'root',
                        projectionStatus: 'ready'
                    }
                }
            ]),
            delete: jest.fn()
        }
        const versionRepository = { update: jest.fn() }
        const projectionStateRepository = {
            findOne: jest.fn().mockResolvedValue({ projectionDocumentId: 'projection-document-1' })
        }
        const knowledgebaseService = {
            getActiveVectorStore: jest.fn().mockResolvedValue({ deleteChunks })
        }
        const service = new KnowledgeWikiProjectionService(
            {} as Repository<KnowledgeDocument>,
            chunkRepository as unknown as Repository<KnowledgeDocumentChunk>,
            versionRepository as unknown as Repository<KnowledgeWikiPageVersion>,
            projectionStateRepository as unknown as Repository<KnowledgeWikiProjectionState>,
            {} as KnowledgeDocumentService,
            knowledgebaseService as unknown as KnowledgebaseService
        )

        await service.retireVersions(Object.assign(new Knowledgebase(), { id: 'kb-1' }), ['version-1'])

        expect(deleteChunks).toHaveBeenCalledWith(['chunk-retired'])
        expect(chunkRepository.delete).toHaveBeenCalledWith(expect.anything())
        expect(versionRepository.update).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ projectionStatus: 'disabled' })
        )
    })
})
