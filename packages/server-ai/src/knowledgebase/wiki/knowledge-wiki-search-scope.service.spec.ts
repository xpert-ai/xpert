import { Document } from '@langchain/core/documents'
import { DocumentMetadata, IKnowledgebase, IKnowledgeWikiChunkMetadata } from '@xpert-ai/contracts'
import { Repository } from 'typeorm'
import {
    KnowledgeWikiPage,
    KnowledgeWikiPageEvidenceEntity,
    KnowledgeWikiPageVersion,
    KnowledgeWikiSourceState
} from './entities'
import { KnowledgeWikiSearchScopeService } from './knowledge-wiki-search-scope.service'

const wikiMetadata: IKnowledgeWikiChunkMetadata = {
    chunkId: 'wiki-chunk-1',
    contentKind: 'wiki',
    wikiPageId: 'page-1',
    wikiPageVersionId: 'version-1',
    wikiPageKey: 'concept:retrieval',
    wikiPageType: 'concept',
    wikiRevision: 1,
    sectionAnchor: 'root',
    projectionStatus: 'ready'
}

function knowledgebase(): IKnowledgebase {
    return {
        id: 'kb-1',
        wikiConfig: { enabled: true, extractionGranularity: 'standard' },
        wikiAvailability: 'ready'
    } as IKnowledgebase
}

function createService(input?: { sourceHash?: string }) {
    const pageRepository = {
        find: jest
            .fn()
            .mockResolvedValue([
                { id: 'page-1', activeVersionId: 'version-1', status: 'ready', projectionStatus: 'ready' }
            ])
    }
    const versionRepository = {
        find: jest.fn().mockResolvedValue([{ id: 'version-1', status: 'ready', projectionStatus: 'ready' }])
    }
    const evidenceRepository = {
        find: jest.fn().mockResolvedValue([
            {
                pageVersionId: 'version-1',
                sourceDocumentIdSnapshot: 'document-1',
                sourceContentHash: 'hash-1'
            }
        ])
    }
    const sourceStateRepository = {
        find: jest.fn().mockResolvedValue([
            {
                sourceDocumentIdSnapshot: 'document-1',
                lastContentHash: input?.sourceHash ?? 'hash-1',
                eligible: true,
                cleanupPending: false
            }
        ])
    }
    const service = new KnowledgeWikiSearchScopeService(
        pageRepository as unknown as Repository<KnowledgeWikiPage>,
        versionRepository as unknown as Repository<KnowledgeWikiPageVersion>,
        evidenceRepository as unknown as Repository<KnowledgeWikiPageEvidenceEntity>,
        sourceStateRepository as unknown as Repository<KnowledgeWikiSourceState>
    )
    return { service, pageRepository }
}

describe('KnowledgeWikiSearchScopeService', () => {
    it('skips all Wiki projections when a Knowledge Filter is active', async () => {
        const { service, pageRepository } = createService()
        const ordinary = new Document<DocumentMetadata>({ pageContent: 'source', metadata: { chunkId: 'chunk-1' } })
        const wiki = new Document<DocumentMetadata>({ pageContent: 'wiki', metadata: wikiMetadata })

        await expect(service.filterVisibleCandidates(knowledgebase(), [ordinary, wiki], true)).resolves.toEqual([
            ordinary
        ])
        expect(pageRepository.find).not.toHaveBeenCalled()
    })

    it('rejects an active page when its evidence hash is no longer current', async () => {
        const { service } = createService({ sourceHash: 'hash-2' })
        const ordinary = new Document<DocumentMetadata>({ pageContent: 'source', metadata: { chunkId: 'chunk-1' } })
        const wiki = new Document<DocumentMetadata>({ pageContent: 'wiki', metadata: wikiMetadata })

        await expect(service.filterVisibleCandidates(knowledgebase(), [ordinary, wiki], false)).resolves.toEqual([
            ordinary
        ])
    })

    it('keeps only the highest-scoring section for each active Wiki page', async () => {
        const { service } = createService()
        const lower = new Document<DocumentMetadata>({
            pageContent: 'lower',
            metadata: { ...wikiMetadata, chunkId: 'wiki-low', score: 0.4 }
        })
        const higher = new Document<DocumentMetadata>({
            pageContent: 'higher',
            metadata: { ...wikiMetadata, chunkId: 'wiki-high', score: 0.9, sectionAnchor: 'details' }
        })

        await expect(service.filterVisibleCandidates(knowledgebase(), [lower, higher], false)).resolves.toEqual([
            higher
        ])
    })
})
