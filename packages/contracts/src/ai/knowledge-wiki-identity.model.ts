import {
  KnowledgeEntityType,
  KnowledgeIdentityDecision,
  KnowledgeIdentityDescriptor,
  KnowledgeIdentityEmbedding
} from './knowledge-identity.model'

export type KnowledgeWikiEntityType = KnowledgeEntityType
export type KnowledgeWikiIdentityDescriptor = KnowledgeIdentityDescriptor | { kind: 'summary' }
export type KnowledgeWikiIdentityEmbedding = KnowledgeIdentityEmbedding
export type KnowledgeWikiIdentityDecision =
  | KnowledgeIdentityDecision
  | {
      outcome: 'source'
      reason: string
      comparedIdentityIds: string[]
    }
