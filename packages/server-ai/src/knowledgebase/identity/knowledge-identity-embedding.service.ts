import { parseIdentityEmbeddingCache } from './knowledge-identity-model'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { KnowledgeIdentityEmbedding } from '@xpert-ai/contracts'
import { Repository } from 'typeorm'
import { KnowledgebaseService } from '../knowledgebase.service'
import { KnowledgeIdentity } from './knowledge-identity.entity'
import { KnowledgeIdentityInput, KnowledgeIdentityCatalogueEntry } from './knowledge-identity.types'
import { identityFingerprint } from './knowledge-identity-catalogue'
import { identityText } from './knowledge-identity-policy'
import { KnowledgeIdentityError } from './knowledge-identity-error'

@Injectable()
export class KnowledgeIdentityEmbeddingService {
    constructor(
        private readonly knowledgebaseService: KnowledgebaseService,
        @InjectRepository(KnowledgeIdentity) private readonly identities: Repository<KnowledgeIdentity>
    ) {}

    async prepare(
        knowledgebaseId: string,
        incoming: KnowledgeIdentityInput,
        entries: KnowledgeIdentityCatalogueEntry[]
    ) {
        incoming.embedding = parseIdentityEmbeddingCache(incoming.embedding)
        for (const entry of entries) entry.profile.embedding = parseIdentityEmbeddingCache(entry.profile.embedding)
        const store = await this.knowledgebaseService.getActiveVectorStore(knowledgebaseId, true, undefined, {
            rerankEnabled: false
        })
        const embeddings = store.vStore.embeddings
        const modelFingerprint =
            store.knowledgebase.embeddingModelFingerprint ??
            identityFingerprint({
                modelId: store.knowledgebase.copilotModel?.id,
                model: store.knowledgebase.copilotModel?.model,
                options: store.knowledgebase.copilotModel?.options,
                dimensions: store.knowledgebase.embeddingDimensions
            })
        const targets: Array<{ text: string; save: (value: KnowledgeIdentityEmbedding) => Promise<void> }> = []
        let dimensions = store.knowledgebase.embeddingDimensions ?? null
        const incomingText = identityText(incoming.canonicalName, incoming.descriptor)
        if (
            incoming.embedding?.modelFingerprint !== modelFingerprint ||
            incoming.embedding?.contentFingerprint !== identityFingerprint(incomingText) ||
            (dimensions !== null && incoming.embedding?.vector.length !== dimensions)
        ) {
            targets.push({
                text: incomingText,
                save: async (value) => {
                    incoming.embedding = value
                }
            })
        }
        for (const entry of entries) {
            if (!entry.profile) continue
            const text = identityText(entry.canonicalName, entry.profile.descriptor)
            if (
                entry.profile.embedding?.modelFingerprint === modelFingerprint &&
                entry.profile.embedding?.contentFingerprint === identityFingerprint(text) &&
                (dimensions === null || entry.profile.embedding.vector.length === dimensions)
            )
                continue
            targets.push({
                text,
                save: async (value) => {
                    // Refresh only the vector cache; never overwrite concurrent identity observations.
                    await this.identities.update({ id: entry.id, revision: entry.revision }, { embedding: value })
                    entry.profile.embedding = value
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
                throw new KnowledgeIdentityError('invalid')
            }
            dimensions ??= vectors[0].length
            if (vectors.some((vector) => vector.length !== dimensions)) throw new KnowledgeIdentityError('invalid')
            for (let i = 0; i < batch.length; i++)
                await batch[i].save({
                    modelFingerprint,
                    contentFingerprint: identityFingerprint(batch[i].text),
                    vector: vectors[i]
                })
        }
        if (entries.some((entry) => entry.profile.embedding.vector.length !== incoming.embedding.vector.length))
            throw new KnowledgeIdentityError('invalid')
    }
}
