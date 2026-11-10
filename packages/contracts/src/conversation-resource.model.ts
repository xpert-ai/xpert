/** A resource locator within an authorized conversation, never an access token or source Project override. */
export type ConversationResourceTarget =
  /** Project content catalog ID, resolved only in the current usage Project. */
  | { kind: 'project-content'; id: string }
  /** Accepted group reference ID, never the source Artifact or publication ID. */
  | { kind: 'group-reference'; id: string }

/** Safe discovery metadata shared by Assistant tools and Workbench pickers. No content, query data or credentials. */
export interface ConversationResourceItem {
  /** Stable locator. Identical source Artifacts in different grants/versions remain distinct references. */
  resource: ConversationResourceTarget
  /** Display title, not an identity or a permission check. */
  title: string
  /** Provider-declared semantic type, also used by the Project content catalog. Never inferred from a title. */
  typeId?: string
  /** Current usage Project; this does not grant membership in a shared resource's authoring Project. */
  projectId: string
  /** Source identity for authorized Project navigation only; absent for group references. */
  contentSource?: { providerKey: string; resourceId: string }
  /** Fixed publication metadata for shared references; never resolves to the latest source version. */
  publication?: { versionId: string; versionNumber: number; expiresAt: string }
  /** Effective discovery hints. Opening, editing and analysis still reauthorize at their own boundaries. */
  access: {
    canOpen: boolean
    canEdit: boolean
    /** Explicitly accepted Agent analysis scope. Project navigation alone declares no analysis permission. */
    analysis: 'none' | 'bindings' | 'explore'
  }
}

/** Query within the host's current conversation. Changing filters starts a new pagination sequence. */
export interface ConversationResourceQuery {
  /** Omit or leave empty to enumerate resources, rather than searching for a guessed title. */
  search?: string
  /** Exact semantic content type declared by the provider; omitted means all supported types. */
  typeId?: string
  /** Shared references are available only in their exact group conversation. */
  origin?: 'all' | 'project' | 'shared'
  /** Opaque server continuation; clients must not construct or reuse it with different filters/scopes. */
  cursor?: string
  /** Maximum items per page, from 1 to 100; defaults to 20. */
  limit?: number
}

export interface ConversationResourcePage {
  items: ConversationResourceItem[]
  /** Null means this query is exhausted; an empty page with a cursor is not an empty directory. */
  nextCursor: string | null
  /** Indicates that the authorized conversation has a group audience, even when no shares match. */
  sharedAvailable: boolean
}

/** Opens a discovered resource through its native authorization adapter in the current Workbench scope. */
export const WORKBENCH_RESOURCE_OPEN_COMMAND = 'workbench.resource.open'
