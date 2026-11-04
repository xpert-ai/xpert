import { Embeddings, EmbeddingsInterface } from '@langchain/core/embeddings'
import { DEFAULT_EMBEDDING_BATCH_SIZE } from '@xpert-ai/contracts'

// Provider adapters do not consistently enforce model limits. Bound each call at
// the host boundary; batching must preserve order and each adapter's usage callbacks.
export function embeddingBatchSize(limit: unknown, ...preferences: unknown[]): number {
    const positiveInteger = (value: unknown): value is number =>
        typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    return Math.min(
        positiveInteger(limit) ? limit : DEFAULT_EMBEDDING_BATCH_SIZE,
        ...preferences.filter(positiveInteger)
    )
}

export class BoundedEmbeddings extends Embeddings {
    constructor(
        private readonly delegate: EmbeddingsInterface,
        readonly batchSize: number
    ) {
        super({})
    }

    async embedDocuments(documents: string[]): Promise<number[][]> {
        const result: number[][] = []
        for (let offset = 0; offset < documents.length; offset += this.batchSize) {
            const batch = documents.slice(offset, offset + this.batchSize)
            result.push(...(await this.delegate.embedDocuments(batch)))
        }
        return result
    }

    embedQuery(document: string): Promise<number[]> {
        return this.delegate.embedQuery(document)
    }
}
