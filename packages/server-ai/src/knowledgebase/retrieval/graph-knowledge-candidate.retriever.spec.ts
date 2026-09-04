import { DocumentInterface } from '@langchain/core/documents'
import { QueryBus } from '@nestjs/cqrs'
import { DocumentMetadata, IKnowledgebase, KnowledgebaseTypeEnum, VectorTypeEnum } from '@xpert-ai/contracts'
import { prepareKnowledgeFilter } from '../filter'
import { GraphKnowledgeCandidateRetriever } from './graph-knowledge-candidate.retriever'
import { KnowledgeRetrievalRequest } from './types'

function document(chunkId: string): DocumentInterface<DocumentMetadata> {
    return { pageContent: chunkId, metadata: { chunkId } }
}

function request(): KnowledgeRetrievalRequest {
    const knowledgebase = {
        id: 'kb-1',
        name: 'Knowledgebase',
        type: KnowledgebaseTypeEnum.Standard,
        metadataSchema: []
    } as IKnowledgebase

    return {
        knowledgebase,
        query: 'quality requirements',
        scope: { tenantId: 'tenant-1', organizationId: 'org-1' },
        modelContext: { xpertId: 'xpert-1', threadId: 'thread-1' },
        preparedFilter: prepareKnowledgeFilter({
            knowledgebase,
            vectorBackend: VectorTypeEnum.PGVECTOR
        })
    }
}

describe('GraphKnowledgeCandidateRetriever', () => {
    it('assigns explicit one-based ranks in graph result order', async () => {
        const first = document('first')
        const second = document('second')
        const queryBus = {
            execute: jest.fn(async () => ({
                docs: [first, second],
                diagnostics: { graphBranchHitCount: 2 }
            }))
        }
        const retriever = new GraphKnowledgeCandidateRetriever(queryBus as unknown as QueryBus)

        const result = await retriever.retrieve(request())

        expect(result.candidates).toEqual([
            { document: first, rank: 1 },
            { document: second, rank: 2 }
        ])
        expect(result.diagnostics).toEqual(expect.objectContaining({ graphBranchHitCount: 2 }))
    })

    it('preserves graph failure state for the caller to handle before fusion', async () => {
        const queryBus = {
            execute: jest.fn(async () => ({ docs: [], failed: true, error: 'graph backend unavailable' }))
        }
        const retriever = new GraphKnowledgeCandidateRetriever(queryBus as unknown as QueryBus)

        const result = await retriever.retrieve(request())

        expect(result).toEqual(
            expect.objectContaining({
                source: 'graph',
                candidates: [],
                failed: true,
                error: 'graph backend unavailable'
            })
        )
    })
})
