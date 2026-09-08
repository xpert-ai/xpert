/** Evidence-derived identity fields. Names and prose must never be used to infer these discriminators. */
export type KnowledgeWikiEntityType =
  | 'person'
  | 'organization'
  | 'product'
  | 'project'
  | 'place'
  | 'event'
  | 'other'
  | 'unknown'

export type KnowledgeWikiIdentityDescriptor =
  | { kind: 'summary' }
  | {
      kind: 'entity'
      entityType: KnowledgeWikiEntityType
      description: string
      scope: string | null
      /** Namespace includes the issuing authority and scope; different issuers are not comparable. */
      identifiers: Array<{ namespace: string; value: string }>
    }
  | { kind: 'concept'; definition: string; domain: string | null; scope: string | null }

export type KnowledgeWikiIdentityEmbedding = {
  modelFingerprint: string
  contentFingerprint: string
  vector: number[]
}

export type KnowledgeWikiIdentityProfile = {
  descriptor: KnowledgeWikiIdentityDescriptor
  aliases: string[]
  embedding: KnowledgeWikiIdentityEmbedding | null
}

export type KnowledgeWikiIdentityDecision = {
  outcome: 'source' | 'new' | 'same' | 'uncertain'
  reason: string
  comparedPageIds: string[]
}
