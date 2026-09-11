import { KNOWLEDGE_CHUNKING_ALGORITHM_VERSION } from '@xpert-ai/contracts'

/** Reprocessing picks up language boundaries; existing chunks and parent-child fingerprints stay untouched. */
export function knowledgeChunkingRevision(provider?: string): string | undefined {
    return provider === 'auto' || provider === 'structure-aware'
        ? `structured-${KNOWLEDGE_CHUNKING_ALGORITHM_VERSION}`
        : provider === 'recursive-character' || provider === 'markdown-recursive'
          ? 'language-1'
          : undefined
}
