import { Repository } from 'typeorm'
import { KnowledgeGraphIndexJobStatus } from '@xpert-ai/contracts'
import { StructuredGraphRuntimeService } from './structured-graph-runtime.service'
import { toStructuredExtraction } from './structured-graph-model'
import { KnowledgeDocument } from '../knowledge-document/document.entity'
import { KnowledgeDocumentChunk } from '../knowledge-document/chunk/chunk.entity'
import { KnowledgeDocumentService } from '../knowledge-document/document.service'
import { Knowledgebase } from '../knowledgebase/knowledgebase.entity'
import { KnowledgebaseService } from '../knowledgebase/knowledgebase.service'
import { KnowledgeGraphIndexJob } from './entities'
import { GraphragService } from './graphrag.service'

const id = '11111111-1111-4111-8111-111111111111'
const input = {
    knowledgebaseId: id,
    documentId: id,
    xpertId: id,
    agentKey: 'AutomotiveAgent',
    publicationKey: 'auto-bom',
    sourceVersion: 'R1',
    chunkIds: ['body'],
    entities: [
        {
            id: 'root',
            namespace: 'auto:R1',
            nodeKey: 'AUTO-01',
            type: 'Root',
            name: 'Automotive assembly',
            chunkIds: ['body']
        }
    ],
    relations: []
}

function fixture() {
    const source = Object.assign(new KnowledgeDocument(), {
        id,
        knowledgebaseId: id,
        contentHash: 'hash',
        publicationEpoch: 2,
        metadata: { systemManagedType: 'agent-writer', ownerXpertId: id, ownerAgentKey: 'AutomotiveAgent' }
    })
    const kb = Object.assign(new Knowledgebase(), { id, graphRag: { enabled: true } })
    const latest = Object.assign(new KnowledgeGraphIndexJob(), {
        id,
        documentId: id,
        status: KnowledgeGraphIndexJobStatus.SUCCESS,
        sourceContentHash: 'hash',
        sourcePublicationEpoch: 2,
        extractionSnapshot: toStructuredExtraction(input)
    })
    const chunks = [{ id, metadata: { chunkId: 'body' } }]
    const dispatchJobs = jest.fn()
    const getRepository = (type: unknown) => {
        if (type === KnowledgeDocument) return { findOneOrFail: async () => source }
        if (type === Knowledgebase) return { findOneOrFail: async () => kb }
        if (type === KnowledgeDocumentChunk) return { find: async () => chunks }
        if (type === KnowledgeGraphIndexJob) return { findOne: async () => latest }
        throw new Error('Unexpected repository')
    }
    const transaction = jest.fn(async (callback) => callback({ getRepository }))
    const jobs: Repository<KnowledgeGraphIndexJob> = Object.assign(Object.create(Repository.prototype), {
        manager: { transaction }
    })
    const service = new StructuredGraphRuntimeService(
        Object.assign(Object.create(KnowledgeDocumentService.prototype), {
            assertDocumentReadAccess: async () => undefined,
            findOne: async () => source
        }),
        Object.assign(Object.create(KnowledgebaseService.prototype), {
            assertKnowledgebaseWriteAccess: async () => kb
        }),
        Object.assign(Object.create(GraphragService.prototype), { dispatchJobs }),
        jobs
    )
    return { service, source, kb, chunks, latest, dispatchJobs, transaction }
}

it('rejects publication by another managed-document owner before reserving a job', async () => {
    const f = fixture()
    f.source.metadata.ownerAgentKey = 'OtherAgent'
    await expect(f.service.publish(input)).rejects.toMatchObject({ status: 403 })
    expect(f.transaction).not.toHaveBeenCalled()
})
it('rejects a stale or incomplete chunk manifest without dispatching', async () => {
    const f = fixture()
    f.chunks.push({ id, metadata: { chunkId: 'new-body' } })
    await expect(f.service.publish(input)).rejects.toMatchObject({ status: 400 })
    expect(f.dispatchJobs).not.toHaveBeenCalled()
})
it('returns the existing successful receipt for the same source epoch and snapshot', async () => {
    const f = fixture()
    await expect(f.service.publish(input)).resolves.toMatchObject({
        publicationId: id,
        unchanged: true,
        status: 'success',
        entityCount: 1
    })
    expect(f.dispatchJobs).not.toHaveBeenCalled()
})
