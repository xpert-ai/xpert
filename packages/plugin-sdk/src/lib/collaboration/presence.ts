import type { ICollaborationActor, ICollaborationPresence } from './types'

// Shared by both engines: presence never carries document updates or owns content state.
/** Connection-specific metadata delivered with a presence snapshot. */
export type CollaborationPresenceSnapshotMetadata = {
  selfClientId: string | null
}

/** Stable, framework-neutral view of active collaboration sessions and deduplicated actors. */
export type CollaborationPresenceStoreSnapshot = {
  selfClientId: string | null
  /** Every active browser/Agent session keyed by `clientId`. */
  sessions: ICollaborationPresence[]
  /** Sessions excluding only this exact browser client. */
  remoteSessions: ICollaborationPresence[]
  /** One entry per actor identity, including the local actor when supplied. */
  collaborators: ICollaborationPresence[]
}

export type CollaborationPresenceStoreOptions = {
  selfActor?: ICollaborationActor | null
  includeSelf?: boolean
  onChange?: (snapshot: CollaborationPresenceStoreSnapshot) => void
}

/** Mutable presence projection used by plugin UIs without coupling them to a framework. */
export interface CollaborationPresenceStore {
  setSelfClientId(clientId: string | null): void
  replace(items: ICollaborationPresence[], selfClientId?: string | null): void
  upsert(item: ICollaborationPresence): void
  remove(clientId: string): void
  clear(): void
  snapshot(): CollaborationPresenceStoreSnapshot
}

/**
 * Keep per-client sessions for cursors while exposing one collaborator per stable actor identity.
 * This prevents a second tab owned by the same user from either duplicating or hiding that user.
 */
export function createCollaborationPresenceStore(
  options: CollaborationPresenceStoreOptions = {}
): CollaborationPresenceStore {
  let selfClientId: string | null = null
  let sessions = new Map<string, ICollaborationPresence>()

  const readSnapshot = (): CollaborationPresenceStoreSnapshot => {
    const activeSessions = Array.from(sessions.values()).sort((left, right) => right.updatedAt - left.updatedAt)
    const remoteSessions = activeSessions.filter((item) => item.clientId !== selfClientId)
    const actors = new Map<string, ICollaborationPresence>()
    for (const item of activeSessions) if (!actors.has(item.presenceId)) actors.set(item.presenceId, item)
    if (options.includeSelf !== false && options.selfActor) {
      const existing = activeSessions.find(
        (item) => item.clientId === selfClientId || item.presenceId === options.selfActor?.presenceId
      )
      actors.set(options.selfActor.presenceId, existing ?? actorPresence(options.selfActor, selfClientId))
    }
    const collaborators = Array.from(actors.values()).sort((left, right) => {
      const leftSelf = left.presenceId === options.selfActor?.presenceId ? 1 : 0
      const rightSelf = right.presenceId === options.selfActor?.presenceId ? 1 : 0
      return rightSelf - leftSelf || right.updatedAt - left.updatedAt
    })
    return { selfClientId, sessions: activeSessions, remoteSessions, collaborators }
  }
  const publish = () => options.onChange?.(readSnapshot())

  return {
    setSelfClientId: (clientId) => {
      selfClientId = clientId
      publish()
    },
    replace: (items, clientId = selfClientId) => {
      selfClientId = clientId
      sessions = new Map(items.map((item) => [item.clientId, item]))
      publish()
    },
    upsert: (item) => {
      sessions.set(item.clientId, item)
      publish()
    },
    remove: (clientId) => {
      if (sessions.delete(clientId)) publish()
    },
    clear: () => {
      sessions.clear()
      selfClientId = null
      publish()
    },
    snapshot: readSnapshot
  }
}

function actorPresence(actor: ICollaborationActor, clientId: string | null): ICollaborationPresence {
  return {
    ...actor,
    clientId: clientId ?? `self:${actor.presenceId}`,
    pageId: null,
    pointer: null,
    focus: null,
    selection: null,
    viewport: null,
    mode: null,
    status: null,
    toolName: null,
    operationLabel: null,
    updatedAt: Date.now()
  }
}

/** Parse untrusted presence payloads shared by both engines; document content is ignored. */
export function parseCollaborationPresence(value: unknown): ICollaborationPresence | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const item = value
  const clientId = stringValue('clientId' in item ? item.clientId : undefined)
  const presenceId = stringValue('presenceId' in item ? item.presenceId : undefined)
  const displayName = stringValue('displayName' in item ? item.displayName : undefined)
  const color = stringValue('color' in item ? item.color : undefined)
  const actorType = 'actorType' in item ? item.actorType : undefined
  if (
    !clientId ||
    !presenceId ||
    !displayName ||
    !color ||
    (actorType !== 'user' && actorType !== 'agent' && actorType !== 'system')
  )
    return null
  return {
    clientId,
    presenceId,
    displayName,
    color,
    actorType,
    avatarUrl: nullableString('avatarUrl' in item ? item.avatarUrl : undefined),
    pageId: nullableString('pageId' in item ? item.pageId : undefined),
    pointer: parsePointer('pointer' in item ? item.pointer : undefined),
    focus: parseFocus('focus' in item ? item.focus : undefined),
    selection: parseSelection('selection' in item ? item.selection : undefined),
    viewport: parseViewport('viewport' in item ? item.viewport : undefined),
    mode: nullableString('mode' in item ? item.mode : undefined),
    status: actorStatus('status' in item ? item.status : undefined),
    toolName: nullableString('toolName' in item ? item.toolName : undefined),
    operationLabel: nullableString('operationLabel' in item ? item.operationLabel : undefined),
    updatedAt: 'updatedAt' in item && typeof item.updatedAt === 'number' ? item.updatedAt : Date.now()
  }
}

function parsePointer(value: unknown): ICollaborationPresence['pointer'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const item = value
  if (!('x' in item) || typeof item.x !== 'number' || !('y' in item) || typeof item.y !== 'number') return null
  return {
    pageId: nullableString('pageId' in item ? item.pageId : undefined),
    x: item.x,
    y: item.y,
    visible: ('visible' in item ? item.visible : undefined) !== false
  }
}

function parseFocus(value: unknown): ICollaborationPresence['focus'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const item = value
  const kind = stringValue('kind' in item ? item.kind : undefined)
  if (!kind) return null
  return {
    kind,
    key: nullableString('key' in item ? item.key : undefined),
    pageId: nullableString('pageId' in item ? item.pageId : undefined),
    elementId: nullableString('elementId' in item ? item.elementId : undefined),
    fieldKey: nullableString('fieldKey' in item ? item.fieldKey : undefined)
  }
}

function parseSelection(value: unknown): ICollaborationPresence['selection'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const item = value
  const kind = 'kind' in item ? item.kind : undefined
  if (kind === 'cells') {
    const cells = 'cells' in item ? item.cells : undefined
    if (
      !cells ||
      typeof cells !== 'object' ||
      !('sheetId' in cells) ||
      typeof cells.sheetId !== 'string' ||
      !cells.sheetId ||
      cells.sheetId.length > 256 ||
      !('startRow' in cells) ||
      !('endRow' in cells) ||
      !('startColumn' in cells) ||
      !('endColumn' in cells)
    )
      return null
    const { sheetId, startRow, endRow, startColumn, endColumn } = cells
    if (
      typeof startRow !== 'number' ||
      typeof endRow !== 'number' ||
      typeof startColumn !== 'number' ||
      typeof endColumn !== 'number' ||
      ![startRow, endRow, startColumn, endColumn].every(Number.isSafeInteger) ||
      startRow < 0 ||
      startColumn < 0 ||
      endRow < startRow ||
      endColumn < startColumn ||
      endRow > 1048575 ||
      endColumn > 16383
    )
      return null
    const baseRevision = 'baseRevision' in cells ? cells.baseRevision : undefined
    if (
      baseRevision !== undefined &&
      (typeof baseRevision !== 'number' || !Number.isSafeInteger(baseRevision) || baseRevision < 1)
    )
      return null
    return {
      kind,
      cells: {
        sheetId,
        startRow,
        endRow,
        startColumn,
        endColumn,
        ...(typeof baseRevision === 'number' ? { baseRevision } : {})
      }
    }
  }
  if (kind !== 'text' && kind !== 'elements') return null
  const elementIds = 'elementIds' in item ? item.elementIds : undefined
  return {
    kind,
    fieldKey: nullableString('fieldKey' in item ? item.fieldKey : undefined),
    elementIds: Array.isArray(elementIds)
      ? elementIds.filter((entry): entry is string => typeof entry === 'string')
      : null,
    anchorRelativeBase64: nullableString('anchorRelativeBase64' in item ? item.anchorRelativeBase64 : undefined),
    headRelativeBase64: nullableString('headRelativeBase64' in item ? item.headRelativeBase64 : undefined)
  }
}

function parseViewport(value: unknown): ICollaborationPresence['viewport'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const item = value
  if (
    !('zoom' in item) ||
    typeof item.zoom !== 'number' ||
    !('width' in item) ||
    typeof item.width !== 'number' ||
    !('height' in item) ||
    typeof item.height !== 'number'
  )
    return null
  return { zoom: item.zoom, width: item.width, height: item.height }
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
function nullableString(value: unknown) {
  return stringValue(value) ?? null
}
function actorStatus(value: unknown) {
  return value === 'thinking' || value === 'editing' || value === 'done' || value === 'failed' ? value : null
}
