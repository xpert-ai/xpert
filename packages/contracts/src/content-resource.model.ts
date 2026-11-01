import type { I18nObject } from './i18n.model'
import type { ArtifactTypeDescriptor } from './artifact.model'

export type ContentAction = 'rename' | 'move' | 'trash' | 'restore' | 'duplicate'
export type ContentSourceLocation =
  | { kind: 'file'; path: string }
  | { kind: 'bundle'; rootPath: string; entryPath: string }
  | { kind: 'managed' }
  | { kind: 'external'; connectionRef: string; externalResourceId: string }

/** Semantic types are open identifiers; model/protocol compatibility determines editability. */
export interface ContentModelIdentity {
  typeId: string
  modelId: string
  schemaVersion: string
  editProtocol: { id: string; version: string }
}
export interface ContentTypeImplementation {
  /** False when creation uses a dedicated workflow (e.g. page creation or file upload).
   * The implementation remains discoverable and its resources can still be indexed. */
  creatable?: boolean
  typeId: string
  title: I18nObject
  implementationKey: string
  implementationTitle: I18nObject
  /** Optional provider-owned creation presets. IDs are validated again on the server. */
  templates?: Array<{ id: string; title: I18nObject; description?: I18nObject }>
  modelId: string
  schemaVersion: string
  defaultEditorKey: string
}
export interface ContentResourceSnapshot extends ContentModelIdentity {
  /** Read-only published content; opening still requires current Project and source authorization. */
  presentation?: { kind: 'artifact'; referenceId: string; type?: ArtifactTypeDescriptor }
  /** Opt in only when all Project readers may read the source even without this provider.
   * Resources with additional native ACLs must omit this field and fail closed offline. */
  offlineAccess?: 'project'
  sourceSync?: { status: 'synced' | 'pending' | 'failed'; revision?: string }
  /** Safe structural preview, never HTML, credentials or viewer-dependent query data. */
  preview?: { kind: 'outline'; revision: string; lines: string[] }
  projectId: string
  title: string
  revision: string
  updatedAt: string
  deleted: boolean
  source: ContentSourceLocation
  /** Internal Project files represented by this resource. Library scanners suppress
   * duplicate entries; this is presentation metadata, never a file access grant.
   * Exported deliverables may remain independent and should not be listed here. */
  containedPaths?: Array<{ path: string; recursive: boolean }>
  defaultEditorKey: string
  allowedActions: ContentAction[]
}
export interface ContentCatalogItem extends ContentResourceSnapshot {
  availability?: 'available' | 'provider-unavailable'
  contentId: string
  resourceRef: { providerKey: string; resourceId: string }
  canWrite: boolean
  bindingRevision: number
}
/** Provider-owned, revision-bound public text only. Never include credentials, query
 * payloads, live query results or executable markup in this shared search projection. */
export interface ContentSearchProjection {
  revision: string
  sections: Array<{ anchor: { kind: string; id: string }; text: string }>
}
/** A resource editor never owns a second copy of the resource's write protocol. */
export interface ResourceContentEditorRegistration {
  kind: 'resource'
  key: string
  protocolVersion: 2
  title: string
  view: { providerKey: string; viewKey: string; entry: string }
  supports: Array<ContentModelIdentity & { access: Array<'view' | 'edit'> }>
}
export const CONTENT_CATALOG_PROVIDER = 'platform.content.catalog'
