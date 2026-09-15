import type { JSONValue } from '@xpert-ai/contracts'
import { createRuntimeCapability } from '../../core/runtime-capability'

export type KnowledgeGraphPublicationOwner = {
  knowledgebaseId: string
  documentId: string
  xpertId: string
  agentKey: string
}

export type KnowledgeGraphPublishedEntity = {
  /** Local reference within this publication. */
  id: string
  /** Stable, issuer-scoped business identity. Occurrences must include assembly/revision scope. */
  namespace: string
  nodeKey: string
  type: string
  name: string
  description?: string
  properties?: Record<string, JSONValue>
  chunkIds: string[]
}

export type KnowledgeGraphPublishedRelation = {
  source: string
  target: string
  type: string
  description?: string
  properties?: Record<string, JSONValue>
  chunkIds: string[]
}

export type KnowledgeGraphPublishInput = KnowledgeGraphPublicationOwner & {
  publicationKey: string
  sourceVersion: string
  /** Complete source chunk manifest; publication rejects concurrent or incomplete writes. */
  chunkIds: string[]
  entities: KnowledgeGraphPublishedEntity[]
  relations: KnowledgeGraphPublishedRelation[]
}

export type KnowledgeGraphPublicationResult = {
  documentId: string
  publicationId: string
  publicationKey: string
  sourceVersion: string
  contentHash: string
  status: 'queued' | 'running' | 'success' | 'failed' | 'cancelled'
  entityCount: number
  relationCount: number
  unchanged: boolean
  error?: string | null
}

export interface KnowledgeGraphApi {
  /** Atomically accepts a complete, validated snapshot. Indexing is durable and retryable. */
  publish(input: KnowledgeGraphPublishInput): Promise<KnowledgeGraphPublicationResult>
  status(input: KnowledgeGraphPublicationOwner): Promise<KnowledgeGraphPublicationResult | null>
  /** Publishes an empty replacement; leaves source chunks and other publishers intact. */
  retract(
    input: KnowledgeGraphPublicationOwner & { publicationKey: string; sourceVersion: string; chunkIds: string[] }
  ): Promise<KnowledgeGraphPublicationResult>
}

export const KnowledgeGraphRuntimeCapability = createRuntimeCapability<KnowledgeGraphApi>('platform.knowledge-graph', {
  description: 'Publish, inspect, and retract source-owned structured knowledge graphs without model extraction.'
})
