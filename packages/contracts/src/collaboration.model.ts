import { IBasePerTenantAndOrganizationEntityModel } from './base-entity.model'

/**
 * Selects who owns authoritative content, not a generic merge algorithm.
 * `yjs`: the platform persists/merges CRDT state and the plugin materializes it.
 * `operations`: the domain service commits its own operations; the platform provides
 * authorized sessions, presence and revision invalidation, without accepting content edits.
 */
export type CollaborationEngine = 'yjs' | 'operations'
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

/** A text range expressed as Yjs relative positions, selected element ids, or a cell range. */
export interface ICollaborationSelection {
  kind: 'text' | 'elements' | 'cells'
  /** Zero-based, bounded range for operation-backed spreadsheet presence. */
  cells?: {
    sheetId: string
    startRow: number
    endRow: number
    startColumn: number
    endColumn: number
    /** Canonical revision whose coordinates this range uses. Absent means unversioned. */
    baseRevision?: number
  } | null
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
 * Platform registration and lifecycle metadata for one collaboration resource.
 * Only `yjs` stores authoritative content here. For `operations`, content and the
 * current revision remain in the domain service; CRDT fields are compatibility placeholders.
 */
export interface ICollaborationDocument extends IBasePerTenantAndOrganizationEntityModel {
  /** Provider registered by a plugin, such as `presentation-studio.deck`. */
  providerKey: string
  /** Stable business-resource id understood by the provider. */
  resourceId: string
  engine: CollaborationEngine
  /** Provider schema version used to fence sessions; not the platform database schema. */
  schemaVersion: number
  status: CollaborationDocumentStatus
  /** Complete Yjs state encoded as a base64 update; empty for `operations`. */
  stateBase64: string
  /** Yjs state vector corresponding to `stateBase64`; empty for `operations`. */
  stateVectorBase64: string
  /** Yjs update sequence. For `operations`, initialization metadata only; never the live domain revision. */
  sequenceNumber: number
  /** Accepted Yjs updates; remains zero for `operations`. */
  updateCount: number
  /** Highest materialized Yjs sequence; unused by the `operations` content pipeline. */
  materializedSequence: number
  /** Yjs projection health; `operations` starts ready and has no platform projection. */
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
  /** SHA-256 deduplication key, unique per document. Ordinary updates hash decoded bytes;
   * schema migrations prefix them with `platform:schema-migration:<targetSchemaVersion>:`. */
  updateHash: string
  origin?: string | null
  actorType?: CollaborationActorType | null
  presenceId?: string | null
  userId?: string | null
}
