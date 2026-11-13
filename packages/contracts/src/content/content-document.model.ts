/** A file-backed editor resource has one identity across paths, Assistants and Views. */
export interface ContentDocumentDescriptor {
  id: string
  resourceRef: { providerKey: 'platform.project.file'; resourceId: string }
  projectId: string
  path: string
  title: string
  modelKey: string
  schemaVersion: number
  epoch: number
  headRevisionId: string
  fileHash: string
  sequence: number
  status: 'ready' | 'pending' | 'conflict' | 'failed' | 'deleted' | 'moving'
}

export interface ContentDocumentBlock {
  id: string
  type: string
  text: string
}

/** Logical page hierarchy is independent of Project file folders and never grants access. */
export interface ContentPageEntry {
  resourceId: string
  title: string
  path: string
}
export interface ContentPageHierarchy {
  supported: boolean
  canCreate: boolean
  parent: ContentPageEntry | null
  children: ContentPageEntry[]
  hasMore: boolean
}

export interface ContentDocumentSelection {
  type: 'text'
  resourceId: string
  epoch: number
  sequence: number
  blockId: string
  text: string
}

export interface ContentDocumentRevision {
  id: string
  resourceId: string
  parentId: string | null
  hash: string
  sequence: number
  epoch: number
  label: string
  createdAt: string
  createdById: string
}

export interface ContentDocumentProposal {
  id: string
  resourceId: string
  mutationId: string
  epoch: number
  sequence: number
  blockId: string
  before: string
  after: string
  status: 'pending' | 'accepted' | 'rejected' | 'stale'
  createdById: string
  assistantId: string | null
}

export interface ContentDocumentComment {
  id: string
  resourceId: string
  blockId: string | null
  epoch: number
  body: string
  resolved: boolean
  createdById: string
  createdAt: string
}

/** Discovery/navigation metadata is independent of an editor's document model. */
export interface ContentEditorMetadata {
  key: string
  protocolVersion: 2
  title: string
  formatId: string
  mimeType: string
  extension: string
  view: { providerKey: string; viewKey: string; entry: string }
}
export interface TextContentEditorRegistration extends ContentEditorMetadata {
  kind: 'text-document'
  schemaVersion: number
  concurrency: 'crdt'
  engine: 'yjs'
}
export interface FileContentEditorRegistration extends ContentEditorMetadata {
  kind: 'file'
  concurrency: 'versioned'
}
export type ContentEditorRegistration =
  | TextContentEditorRegistration
  | FileContentEditorRegistration
  | import('./content-resource.model').ResourceContentEditorRegistration

/**
 * Resolve an authorized resource to its registered editor, without opening UI.
 * Send the returned navigation through workbench.navigation.open in the same
 * Remote View bridge so the Workbench that contains the caller owns the tab.
 */
export const CONTENT_EDITOR_RESOLVE_COMMAND = 'workbench.content.resolve'
/** Authorize a document and return its stable URL without changing navigation or clipboard. */
export const CONTENT_EDITOR_LINK_COMMAND = 'workbench.content.link'
export interface ContentEditorLinkResult {
  success: true
  url: string
}
/** Explicit document-reference discriminator in share URLs; consumers must reauthorize the ID. */
export const CONTENT_DOCUMENT_LINK_RESOURCE_PARAM = 'contentResource'
export const ASSISTANT_CONTENT_REVIEW_COMMAND = 'assistant.content.review'
export const CONTENT_EDITOR_STATUS_COMMAND = 'workbench.content.status'
export interface ContentEditorOpenRequest {
  /** Omit for a platform text document; resource providers are reauthorized server-side. */
  providerKey?: string
  resourceId: string
  /** Explicit choice, accepted only if the model and edit protocol are compatible. */
  editorKey?: string
}
export interface ContentEditorResolveResult {
  success: true
  navigation: {
    target: 'workbench.view'
    viewKey: string
    selectionId: string
    parameters?: { contentProvider: string }
  }
}
export interface ContentEditorStatus {
  resourceId: string
  dirty: boolean
  label: string
}
