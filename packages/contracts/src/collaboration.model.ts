import { IBasePerTenantAndOrganizationEntityModel } from './base-entity.model'

export type CollaborationEngine = 'yjs'
export type CollaborationDocumentStatus = 'active' | 'archived' | 'deleted'
export type CollaborationMaterializationStatus = 'ready' | 'pending' | 'failed'
export type CollaborationActorType = 'user' | 'agent' | 'system'
export type CollaborationActorStatus = 'thinking' | 'editing' | 'done' | 'failed'
export type CollaborationAccess = 'read' | 'write' | 'manage'

/** Safe, presentation-ready identity exposed to collaboration clients. */
export interface ICollaborationActor {
  /** Opaque, stable identity for presence; it must not reveal a platform user id. */
  presenceId: string
  actorType: CollaborationActorType
  displayName: string
  color: string
  avatarUrl?: string | null
}

/** Pointer coordinates normalized to the collaborative page, in the inclusive 0..1 range. */
export interface ICollaborationPointer {
  pageId?: string | null
  x: number
  y: number
  visible: boolean
}

/** Optional viewport metadata used to render remote cursors at the correct scale. */
export interface ICollaborationViewport {
  zoom: number
  width: number
  height: number
}

/** Semantic location currently operated on by a collaborator. */
export interface ICollaborationFocus {
  /** Plugin-defined focus category, for example `slide`, `text`, `control`, or `element`. */
  kind: string
  key?: string | null
  pageId?: string | null
  elementId?: string | null
  fieldKey?: string | null
}

/** A text range expressed as Yjs relative positions, or a set of selected element ids. */
export interface ICollaborationSelection {
  kind: 'text' | 'elements'
  fieldKey?: string | null
  elementIds?: string[] | null
  anchorRelativeBase64?: string | null
  headRelativeBase64?: string | null
}

/**
 * Ephemeral presence shared by users, agents, and system actors.
 * Presence is intentionally not part of the persisted collaboration document.
 */
export interface ICollaborationPresence extends ICollaborationActor {
  /** Socket id for users, or the opaque presence id for virtual actors. */
  clientId: string
  pageId?: string | null
  pointer?: ICollaborationPointer | null
  focus?: ICollaborationFocus | null
  selection?: ICollaborationSelection | null
  viewport?: ICollaborationViewport | null
  mode?: string | null
  status?: CollaborationActorStatus | null
  toolName?: string | null
  operationLabel?: string | null
  updatedAt: number
}

/**
 * Authoritative, platform-managed state of one plugin collaboration resource.
 * Plugin business entities are materialized projections of this Yjs state.
 */
export interface ICollaborationDocument extends IBasePerTenantAndOrganizationEntityModel {
  /** Provider registered by a plugin, such as `presentation-studio.deck`. */
  providerKey: string
  /** Stable business-resource id understood by the provider. */
  resourceId: string
  engine: CollaborationEngine
  /** Version of the plugin-owned Yjs schema, not the platform database schema. */
  schemaVersion: number
  status: CollaborationDocumentStatus
  /** Complete Yjs state encoded as a base64 update. */
  stateBase64: string
  /** State vector corresponding exactly to `stateBase64`. */
  stateVectorBase64: string
  /** Monotonic platform sequence incremented once for each unique accepted update. */
  sequenceNumber: number
  updateCount: number
  /** Highest sequence successfully projected into the plugin business entity. */
  materializedSequence: number
  materializationStatus: CollaborationMaterializationStatus
  lastMaterializationError?: string | null
  workspaceId?: string | null
  projectId?: string | null
  xpertId?: string | null
  userId?: string | null
  metadata?: Record<string, unknown> | null
}

/** Immutable update journal entry used for idempotency and bounded delta retention. */
export interface ICollaborationUpdate extends IBasePerTenantAndOrganizationEntityModel {
  document?: ICollaborationDocument | null
  documentId: string
  /** Sequence assigned while the document row is locked. */
  sequenceNumber: number
  updateBase64: string
  /** SHA-256 of the decoded update bytes; unique per document. */
  updateHash: string
  origin?: string | null
  actorType?: CollaborationActorType | null
  presenceId?: string | null
  userId?: string | null
}
