import { createRuntimeCapability } from '../../core/runtime-capability'
import type { ArtifactVersionInput, ArtifactVersionRecord } from './artifacts'

/** Mutable working copy. Revision numbers are never published version numbers. */
export type ArtifactDraftRecord = ArtifactVersionInput & {
  id: string
  artifactId: string
  revision: number
  baseVersionId: string | null
  publishedRevision: number | null
  publishedVersionId: string | null
  updatedAt?: string | Date
}
export type SaveArtifactDraftInput = ArtifactVersionInput & {
  artifactId: string
  expectedRevision: number
  expectedCurrentVersionId: string | null
}
export type PublishArtifactDraftInput = {
  artifactId: string
  expectedRevision: number
  expectedCurrentVersionId: string | null
}
export interface ArtifactDraftsApi {
  list(artifactIds: string[]): Promise<ArtifactDraftRecord[]>
  /** Catalog/recycle-bin reads only; ordinary editors must leave includeArchived unset. */
  get(artifactId: string, options?: { includeArchived?: boolean }): Promise<ArtifactDraftRecord | null>
  /** Manager-only CAS lifecycle; recycling revokes all links, restoring never reactivates them. */
  setRecycled(input: { artifactId: string; expectedRevision: number; recycled: boolean }): Promise<ArtifactDraftRecord>
  save(input: SaveArtifactDraftInput): Promise<ArtifactDraftRecord>
  /** Trusted application action only; never expose this operation as an Agent tool. */
  publish(input: PublishArtifactDraftInput): Promise<ArtifactVersionRecord>
}
export const ArtifactDraftsRuntimeCapability = createRuntimeCapability<ArtifactDraftsApi>('platform.artifact-drafts', {
  description:
    'Persist working copies with optimistic concurrency; atomically publish a confirmed revision as an immutable Artifact version.'
})
