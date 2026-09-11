import { KNOWLEDGE_CHUNKING_ALGORITHM_VERSION } from '@xpert-ai/contracts'

/** New strategy revisions participate in processing/cache fingerprints without changing legacy hashes. */
export function knowledgeChunkingRevision(provider?: string): string | undefined {
    // Version 3 also expires structured-2 entries that incorrectly carried version 1 diagnostics.
    return provider === 'auto' || provider === 'structure-aware'
        ? `structured-${KNOWLEDGE_CHUNKING_ALGORITHM_VERSION}`
        : undefined
}
