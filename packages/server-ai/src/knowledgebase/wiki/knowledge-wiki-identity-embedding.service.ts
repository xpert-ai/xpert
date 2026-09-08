import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { KnowledgeWikiIdentityEmbedding } from '@xpert-ai/contracts'
import { Repository } from 'typeorm'
import { KnowledgebaseService } from '../knowledgebase.service'
import { KnowledgeWikiJob, KnowledgeWikiPage, KnowledgeWikiSourceMapResult } from './entities'
import { hashKnowledgeWikiValue } from './knowledge-wiki-generation.utils'
import { wikiIdentityText } from './knowledge-wiki-dedup'
import { KnowledgeWikiError } from './knowledge-wiki-error'

@Injectable()
export class KnowledgeWikiIdentityEmbeddingService {
    constructor(
        private readonly knowledgebaseService: KnowledgebaseService,
        @InjectRepository(KnowledgeWikiPage) private readonly pages: Repository<KnowledgeWikiPage>,
        @InjectRepository(KnowledgeWikiSourceMapResult)
        private readonly results: Repository<KnowledgeWikiSourceMapResult>
    ) {}

    async prepare(job: KnowledgeWikiJob, incoming: KnowledgeWikiSourceMapResult, pages: KnowledgeWikiPage[]) {
        const store = await this.knowledgebaseService.getActiveVectorStore(job.knowledgebaseId, true, undefined, {
            rerankEnabled: false
        })
        const embeddings = store.vStore.embeddings
        const modelFingerprint =
            store.knowledgebase.embeddingModelFingerprint ??
            hashKnowledgeWikiValue({
                modelId: store.knowledgebase.copilotModel?.id,
                model: store.knowledgebase.copilotModel?.model,
                options: store.knowledgebase.copilotModel?.options,
                dimensions: store.knowledgebase.embeddingDimensions
            })
        const targets: Array<{ text: string; save: (value: KnowledgeWikiIdentityEmbedding) => Promise<void> }> = []
        let dimensions = store.knowledgebase.embeddingDimensions ?? null
        const incomingText = wikiIdentityText(incoming.canonicalName, incoming.identity)
        if (
            incoming.identityEmbedding?.modelFingerprint !== modelFingerprint ||
            incoming.identityEmbedding?.contentFingerprint !== hashKnowledgeWikiValue(incomingText) ||
            (dimensions !== null && incoming.identityEmbedding?.vector.length !== dimensions)
        ) {
            targets.push({
                text: incomingText,
                save: async (value) => {
                    incoming.identityEmbedding = value
                    await this.results.update(incoming.id, { identityEmbedding: value })
                }
            })
        }
        for (const page of pages) {
            if (!page.identity) continue
            const text = wikiIdentityText(page.canonicalName, page.identity.descriptor)
            if (
                page.identity.embedding?.modelFingerprint === modelFingerprint &&
                page.identity.embedding?.contentFingerprint === hashKnowledgeWikiValue(text) &&
                (dimensions === null || page.identity.embedding.vector.length === dimensions)
            )
                continue
            targets.push({
                text,
                save: async (value) => {
                    const identity = { ...page.identity, embedding: value }
                    // A cache refresh must neither change article version nor overwrite a concurrent alias decision.
                    await this.pages.update(
                        { id: page.id, identityRevision: page.identityRevision },
                        {
                            identity,
                            version: () => '"version"'
                        }
                    )
                    page.identity = identity
                }
            })
        }
        for (let offset = 0; offset < targets.length; offset += 32) {
            const batch = targets.slice(offset, offset + 32)
            const vectors = await embeddings.embedDocuments(batch.map((target) => target.text))
            if (
                vectors.length !== batch.length ||
                vectors.some(
                    (vector) =>
                        !vector.length ||
                        vector.every((value) => value === 0) ||
                        vector.some((value) => !Number.isFinite(value))
                )
            ) {
                throw new KnowledgeWikiError('knowledge_wiki_identity_invalid')
            }
            dimensions ??= vectors[0].length
            if (vectors.some((vector) => vector.length !== dimensions))
                throw new KnowledgeWikiError('knowledge_wiki_identity_invalid')
            for (let i = 0; i < batch.length; i++)
                await batch[i].save({
                    modelFingerprint,
                    contentFingerprint: hashKnowledgeWikiValue(batch[i].text),
                    vector: vectors[i]
                })
        }
        if (pages.some((page) => page.identity.embedding.vector.length !== incoming.identityEmbedding.vector.length))
            throw new KnowledgeWikiError('knowledge_wiki_identity_invalid')
    }
}
