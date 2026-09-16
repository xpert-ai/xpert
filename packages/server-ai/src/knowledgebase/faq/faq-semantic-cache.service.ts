import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable, Logger } from '@nestjs/common'
import type { Cache } from 'cache-manager'
import { createHash } from 'node:crypto'
import { t } from 'i18next'
import { FAQSemanticError, isValidFAQVector } from './faq-semantic-match'

const CACHE_TTL_MS = 30 * 60 * 1000
export const FAQ_EMBEDDING_BATCH_SIZE = 32
export const FAQ_MODEL_TIMEOUT_MS = 30_000

export function faqContentHash(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export async function withFAQTimeout<T>(operation: Promise<T>, timeout = FAQ_MODEL_TIMEOUT_MS): Promise<T> {
    let timer: ReturnType<typeof setTimeout>
    try {
        return await Promise.race([
            operation,
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new FAQSemanticError('timeout')), timeout)
            })
        ])
    } finally {
        clearTimeout(timer)
    }
}

export type FAQCacheStats = { cacheHits: number; encodedTexts: number; cacheErrors: number; coalescedTexts: number }
type PendingVector = {
    promise: Promise<number[]>
    resolve: (value: number[]) => void
    reject: (reason: unknown) => void
}

@Injectable()
export class FAQSemanticCacheService {
    private readonly logger = new Logger(FAQSemanticCacheService.name)
    // Redis values are shared across replicas; in-flight coalescing is per process, not a distributed lock.
    private readonly pending = new Map<string, Promise<number[]>>()

    constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

    async vectors(
        identity: string,
        texts: string[],
        dimensions: number,
        embed: (texts: string[]) => Promise<number[][]>,
        stats: FAQCacheStats
    ): Promise<Map<string, number[]>> {
        const unique = [...new Set(texts)]
        const values = new Map<string, number[]>()
        const waiting = new Map<string, Promise<number[]>>()
        const owned = new Map<string, PendingVector>()
        const key = (text: string) => `faq-semantic:v1:${identity}:${faqContentHash(text)}`
        const cached = await Promise.all(
            unique.map(async (text) => {
                try {
                    const vector = await withFAQTimeout(this.cache.get<unknown>(key(text)), 1000)
                    return isValidFAQVector(vector) && vector.length === dimensions ? vector : undefined
                } catch {
                    stats.cacheErrors++
                    return undefined
                }
            })
        )
        unique.forEach((text, index) => {
            if (cached[index]) {
                stats.cacheHits++
                values.set(text, cached[index])
                return
            }
            const previous = this.pending.get(key(text))
            if (previous) {
                stats.coalescedTexts++
                waiting.set(text, previous)
                return
            }
            let resolve: PendingVector['resolve']
            let reject: PendingVector['reject']
            const promise = new Promise<number[]>((yes, no) => {
                resolve = yes
                reject = no
            })
            owned.set(text, { promise, resolve, reject })
            waiting.set(text, promise)
            this.pending.set(key(text), promise)
        })

        const compute = async () => {
            const missing = [...owned.keys()]
            try {
                for (let start = 0; start < missing.length; start += FAQ_EMBEDDING_BATCH_SIZE) {
                    const batch = missing.slice(start, start + FAQ_EMBEDDING_BATCH_SIZE)
                    const vectors = await withFAQTimeout(embed(batch))
                    if (
                        vectors.length !== batch.length ||
                        vectors.some((vector) => !isValidFAQVector(vector) || vector.length !== dimensions)
                    ) {
                        throw new FAQSemanticError('invalid_vector')
                    }
                    stats.encodedTexts += batch.length
                    await Promise.all(
                        batch.map(async (text, index) => {
                            try {
                                await withFAQTimeout(this.cache.set(key(text), vectors[index], CACHE_TTL_MS), 1000)
                            } catch {
                                stats.cacheErrors++
                                this.logger.warn(
                                    t('server-ai:Error.KnowledgeFAQSemanticCacheWriteFailed', {
                                        defaultValue: 'FAQ semantic vector cache write failed; using computed vectors.'
                                    })
                                )
                            }
                            owned.get(text).resolve(vectors[index])
                        })
                    )
                }
            } catch (error) {
                for (const item of owned.values())
                    item.reject(error instanceof FAQSemanticError ? error : new FAQSemanticError('model_failed'))
            } finally {
                for (const [text, item] of owned) {
                    if (this.pending.get(key(text)) === item.promise) this.pending.delete(key(text))
                }
            }
        }
        // Attach rejection handlers before starting model work; every owned promise is observed.
        const result = Promise.all([...waiting].map(async ([text, promise]) => values.set(text, await promise)))
        await Promise.all([compute(), result])
        return values
    }
}
