import type {
  CollaborationAccess,
  CollaborationActorStatus,
  CollaborationActorType,
  CollaborationDocumentStatus,
  CollaborationEngine,
  CollaborationMaterializationStatus,
  ICollaborationActor,
  ICollaborationFocus,
  ICollaborationPointer,
  ICollaborationPresence,
  ICollaborationSelection,
  ICollaborationViewport
} from '@xpert-ai/contracts'

export type {
  CollaborationAccess,
  CollaborationActorStatus,
  CollaborationActorType,
  CollaborationDocumentStatus,
  CollaborationEngine,
  CollaborationMaterializationStatus,
  ICollaborationActor,
  ICollaborationFocus,
  ICollaborationPointer,
  ICollaborationPresence,
  ICollaborationSelection,
  ICollaborationViewport
} from '@xpert-ai/contracts'

/** Tenant and business scope inherited by every collaboration operation. */
export type CollaborationScope = {
  tenantId?: string | null
  organizationId?: string | null
  workspaceId?: string | null
  projectId?: string | null
  xpertId?: string | null
  userId?: string | null
}

/** Optional identity override for Agent or system initiated runtime calls. */
export type CollaborationRuntimeActor = {
  actorType?: CollaborationActorType | null
  actorKey?: string | null
  displayName?: string | null
  avatarUrl?: string | null
}

/** Metadata-only representation of the platform collaboration document. */
export type CollaborationDocumentRecord = CollaborationScope & {
  id: string
  providerKey: string
  resourceId: string
  engine: CollaborationEngine
  schemaVersion: number
  status: CollaborationDocumentStatus
  sequenceNumber: number
  updateCount: number
  materializedSequence: number
  materializationStatus: CollaborationMaterializationStatus
  lastMaterializationError?: string | null
  metadata?: Record<string, unknown> | null
  createdAt?: string | Date
  updatedAt?: string | Date
}

/**
 * A full or state-vector-relative Yjs update together with its document metadata.
 * `updateBase64` is safe to apply to a client whose vector was supplied in the request.
 */
export type CollaborationDocumentState = {
  document: CollaborationDocumentRecord
  updateBase64: string
  stateVectorBase64: string
  sequenceNumber: number
}

/** Creates the platform document lazily through the registered plugin provider. */
export type EnsureCollaborationDocumentInput = {
  providerKey: string
  resourceId: string
  schemaVersion?: number | null
  metadata?: Record<string, unknown> | null
}

/** Locate a document either by platform id or by the provider's business resource key. */
export type GetCollaborationDocumentInput =
  | { documentId: string; providerKey?: never; resourceId?: never }
  | { documentId?: never; providerKey: string; resourceId: string }

export type GetCollaborationDocumentStateInput = GetCollaborationDocumentInput & {
  /** Omit for complete state; provide a Yjs state vector to receive only the missing delta. */
  stateVectorBase64?: string | null
}

/** Submit one Yjs update to the authoritative platform document. */
export type ApplyCollaborationUpdateInput = {
  documentId: string
  updateBase64: string
  origin?: string | null
  /** Optional compare-and-set guard for destructive or order-sensitive operations. */
  expectedSequence?: number | null
  actor?: CollaborationRuntimeActor | null
}

/** Acknowledgement for a unique or deduplicated collaboration update. */
export type ApplyCollaborationUpdateResult = {
  documentId: string
  duplicate: boolean
  sequenceNumber: number
  updateId?: string | null
  stateVectorBase64: string
  materializationStatus: CollaborationMaterializationStatus
}

/** Request a short-lived browser session with no platform token exposure. */
export type CreateCollaborationSessionInput = {
  documentId: string
  access?: Exclude<CollaborationAccess, 'manage'> | null
}

/** Credentials and backend URL required by a browser transport. */
export type CollaborationSessionDescriptor = {
  sessionId: string
  clientKey: string
  documentId: string
  namespace: string
  /** Backend public base URL; clients must not derive this from `window.location`. */
  connectionUrl: string
  access: Exclude<CollaborationAccess, 'manage'>
  actor: ICollaborationActor
  expiresAt: number
}

/** Bounded, ephemeral state that may be broadcast without persisting document content. */
export type CollaborationPresencePatch = {
  pageId?: string | null
  pointer?: ICollaborationPointer | null
  focus?: ICollaborationFocus | null
  selection?: ICollaborationSelection | null
  viewport?: ICollaborationViewport | null
  mode?: string | null
  status?: CollaborationActorStatus | null
  toolName?: string | null
  operationLabel?: string | null
}

/** Create or refresh an Agent/system presence without opening a WebSocket connection. */
export type UpsertVirtualPresenceInput = {
  documentId: string
  actor?: CollaborationRuntimeActor | null
  presence: CollaborationPresencePatch
}

/** Remove a virtual presence explicitly; otherwise it disappears through TTL expiry. */
export type RemoveVirtualPresenceInput = {
  documentId: string
  presenceId?: string | null
  actorKey?: string | null
}

/** Runtime capability exposed to scoped plugin and Agent executions. */
export interface CollaborationApi {
  /** Ensure a provider/resource pair has one platform collaboration document. */
  ensureDocument(input: EnsureCollaborationDocumentInput): Promise<CollaborationDocumentRecord>
  /** Read document metadata and trigger materialization read repair when required. */
  getDocument(input: GetCollaborationDocumentInput): Promise<CollaborationDocumentRecord>
  /** Read complete state or a state-vector-relative Yjs delta. */
  getDocumentState(input: GetCollaborationDocumentStateInput): Promise<CollaborationDocumentState>
  /** Authorize, deduplicate, merge, persist, broadcast, and materialize an update. */
  applyUpdate(input: ApplyCollaborationUpdateInput): Promise<ApplyCollaborationUpdateResult>
  /** Issue single-document browser credentials with read or write access. */
  createSession(input: CreateCollaborationSessionInput): Promise<CollaborationSessionDescriptor>
  /** List currently active user and virtual collaborator presence. */
  listPresence(input: { documentId: string }): Promise<ICollaborationPresence[]>
  /** Publish or refresh an Agent/system collaborator. */
  upsertVirtualPresence(input: UpsertVirtualPresenceInput): Promise<ICollaborationPresence | null>
  /** Remove an Agent/system collaborator before its TTL expires. */
  removeVirtualPresence(input: RemoveVirtualPresenceInput): Promise<void>
  /** Stop normal editing while retaining the document. */
  archiveDocument(input: GetCollaborationDocumentInput): Promise<CollaborationDocumentRecord>
  /** Soft-delete the platform document and notify its provider. */
  deleteDocument(input: GetCollaborationDocumentInput): Promise<CollaborationDocumentRecord>
}

export type CollaborationProviderOperation = CollaborationAccess | 'initialize' | 'materialize' | 'delete'

/** Context passed to a plugin provider for every authorization and lifecycle operation. */
export type CollaborationProviderContext = CollaborationScope & {
  documentId?: string | null
  providerKey: string
  resourceId: string
  operation: CollaborationProviderOperation
  actor?: ICollaborationActor | null
}

/** Initial Yjs snapshot returned when the platform first sees a business resource. */
export type CollaborationDocumentInitialization = {
  stateBase64: string
  schemaVersion: number
  /** Preserve an existing plugin revision when migrating legacy collaborative data. */
  initialSequence?: number | null
  metadata?: Record<string, unknown> | null
}

/** Authoritative state delivered to the plugin after an accepted update or read repair. */
export type CollaborationMaterializationEvent = CollaborationProviderContext & {
  documentId: string
  stateBase64: string
  stateVectorBase64: string
  sequenceNumber: number
  updateBase64?: string | null
  origin?: string | null
}

/**
 * Plugin-owned adapter between a business resource and the platform collaboration engine.
 * Authorization remains the plugin's responsibility; the platform owns transport and CRDT state.
 */
export interface ICollaborationDocumentProvider {
  /** Authorize the exact resource and requested operation in the supplied platform scope. */
  authorize(context: CollaborationProviderContext): Promise<boolean> | boolean
  /** Return an idempotent initial snapshot without creating a business version. */
  initializeDocument(
    context: CollaborationProviderContext
  ): Promise<CollaborationDocumentInitialization> | CollaborationDocumentInitialization
  /** Project platform state into plugin query/export entities. The method must be idempotent. */
  materializeDocument(event: CollaborationMaterializationEvent): Promise<void> | void
  /** Optionally clean plugin-owned associations after a platform soft delete. */
  onDocumentDeleted?(context: CollaborationProviderContext): Promise<void> | void
}
