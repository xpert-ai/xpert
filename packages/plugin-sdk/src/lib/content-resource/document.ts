import type {
  ContentDocumentBlock,
  ContentDocumentDescriptor,
  ContentDocumentRevision,
  ContentDocumentProposal,
  TextContentEditorRegistration,
  ContentDocumentComment,
  ContentPageHierarchy
} from '@xpert-ai/contracts'
import { createRuntimeCapability } from '../core/runtime-capability'
import type { CollaborationSessionDescriptor } from '../collaboration/types'
import type { ContentActor, ContentResourceReference } from './index'

export type ContentDocumentScope = { actor: ContentActor; projectId: string; assistantId?: string }
/** resourceId identifies a platform ContentDocument. Source hooks use ContentSourceInput.sourceResourceId. */
export type ContentDocumentInput = ContentDocumentScope & { resourceId: string }
export type ContentLocationChangeInput = ContentDocumentScope & {
  source: ContentResourceReference
  path: string
  destination: string
  title: string
  parentResourceId: string | null
  deleted: boolean
  expectedSourceVersion: number
}
export type ContentTextPatch = {
  blockId: string
  before: string
  after: string
  expectedSequence: number
  epoch: number
  mutationId: string
}
export type ContentDocumentState = {
  document: ContentDocumentDescriptor
  stateBase64: string
  markdown: string
  blocks: ContentDocumentBlock[]
  canWrite: boolean
  externalChange: boolean
}
export interface ContentDocumentModel {
  readonly descriptor: TextContentEditorRegistration
  /** Explicit, lossless upgrade only. Throw for unsupported source versions; never guess from content. */
  upgrade?(stateBase64: string, fromSchemaVersion: number): string
  initialize(markdown: string, anchors?: Array<{ id: string; text: string }>): string
  validate(stateBase64: string): void
  read(stateBase64: string): { markdown: string; blocks: ContentDocumentBlock[] }
  patch(stateBase64: string, patch: Pick<ContentTextPatch, 'blockId' | 'before' | 'after'>): string
}
/** Callers supply only server-authenticated scope. Each operation rechecks current resource access. */
export interface ContentDocumentsApi {
  /** Provider-owned logical hierarchy; file locations and project permissions remain unchanged. */
  hierarchy(input: ContentDocumentInput): Promise<ContentPageHierarchy>
  /** Retry with the same requestId/title after an unknown outcome; creates exactly one independent file. */
  createChild(input: ContentDocumentInput & { title: string; requestId: string }): Promise<ContentDocumentDescriptor>
  /** Recent documents visible to the caller in the current project, limited to 100. */
  list(input: ContentDocumentScope & { modelKey: string }): Promise<ContentDocumentDescriptor[]>
  /** Durable move/trash/restore; freezes rooms before filesystem mutation and projects metadata after commit. */
  move(input: ContentLocationChangeInput): Promise<void>
  validateImport(input: ContentDocumentScope & { modelKey: string; markdown: string }): Promise<void>
  register(
    input: ContentDocumentScope & {
      resourceId: string
      path: string
      title: string
      modelKey: string
      source: ContentResourceReference
      anchors?: Array<{ id: string; text: string }>
    }
  ): Promise<ContentDocumentDescriptor>
  get(input: ContentDocumentInput): Promise<ContentDocumentState>
  session(
    input: ContentDocumentInput & { schemaVersion: number }
  ): Promise<ContentDocumentState & { session: CollaborationSessionDescriptor }>
  update(
    input: ContentDocumentInput & { epoch: number; schemaVersion: number; updateBase64: string }
  ): Promise<{ sequenceNumber: number; materializationStatus: 'ready' | 'pending' | 'failed' }>
  history(input: ContentDocumentInput): Promise<ContentDocumentRevision[]>
  preview(
    input: ContentDocumentInput & { revisionId: string }
  ): Promise<{ revision: ContentDocumentRevision; markdown: string }>
  checkpoint(input: ContentDocumentInput & { label: string }): Promise<ContentDocumentRevision>
  propose(input: ContentDocumentInput & ContentTextPatch): Promise<ContentDocumentProposal>
  proposals(input: ContentDocumentInput): Promise<ContentDocumentProposal[]>
  decide(input: ContentDocumentInput & { proposalId: string; accept: boolean }): Promise<ContentDocumentProposal>
  comments(input: ContentDocumentInput): Promise<ContentDocumentComment[]>
  comment(input: ContentDocumentInput & { body: string; blockId: string | null }): Promise<ContentDocumentComment>
  resolveComment(
    input: ContentDocumentInput & { commentId: string; resolved: boolean }
  ): Promise<ContentDocumentComment>
  restore(
    input: ContentDocumentInput & { revisionId: string; expectedSequence: number; epoch: number }
  ): Promise<ContentDocumentDescriptor>
  reconcile(
    input: ContentDocumentInput & {
      choice: 'file' | 'document'
      expectedHash: string
      expectedSequence: number
      epoch: number
    }
  ): Promise<ContentDocumentDescriptor>
  setDeleted(input: ContentDocumentInput & { deleted: boolean }): Promise<void>
  /** File moves retain resource identity; source authorization must already reflect the new path. */
  relocate(input: ContentDocumentInput & { path: string; title: string }): Promise<void>
}
export const ContentDocumentsRuntimeCapability = createRuntimeCapability<ContentDocumentsApi>(
  'platform.content.documents',
  { description: 'Project file-backed editor sessions, versioned publication and Assistant review.' }
)
