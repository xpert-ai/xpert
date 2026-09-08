/** Identity belongs to the knowledgebase, independently of its Wiki and Graph projections. */
export type KnowledgeEntityType =
  | 'person'
  | 'organization'
  | 'product'
  | 'project'
  | 'place'
  | 'event'
  | 'other'
  | 'unknown'

export type KnowledgeIdentityDescriptor =
  | {
      kind: 'entity'
      entityType: KnowledgeEntityType
      description: string
      scope: string | null
      /** Include the issuing authority and scope in the namespace. */
      identifiers: Array<{ namespace: string; value: string }>
    }
  | { kind: 'concept'; definition: string; domain: string | null; scope: string | null }

export type KnowledgeIdentityEmbedding = {
  modelFingerprint: string
  contentFingerprint: string
  vector: number[]
}

export type KnowledgeIdentityProfile = {
  descriptor: KnowledgeIdentityDescriptor
  aliases: string[]
  embedding: KnowledgeIdentityEmbedding | null
}

export type KnowledgeIdentityDecision = {
  outcome: 'new' | 'same' | 'uncertain'
  reason: string
  comparedIdentityIds: string[]
}

export type KnowledgeIdentityObservationPayload = {
  canonicalName: string
  descriptor: KnowledgeIdentityDescriptor
  aliases: string[]
  facts: Array<{ text: string; sourceChunkIds: string[] }>
}
