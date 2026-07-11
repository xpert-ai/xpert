import type {
  ApplyCollaborationUpdateResult,
  CollaborationPresencePatch,
  CollaborationSessionDescriptor,
  ICollaborationPresence
} from './types'

export type CollaborationTransportPayload = Record<string, unknown>
export type CollaborationTransportHandler = (payload: CollaborationTransportPayload) => void

/** Framework-neutral event transport used by the collaboration client. */
export interface CollaborationTransport {
  readonly connected: boolean
  connect(): void
  disconnect(): void
  emit(event: string, payload?: CollaborationTransportPayload): void
  on(event: string, handler: CollaborationTransportHandler): () => void
}

/** Minimal Socket.IO-compatible shape; keeps socket.io-client out of the SDK bundle. */
export interface CollaborationSocketLike {
  readonly connected: boolean
  connect(): unknown
  disconnect(): unknown
  emit(event: string, payload?: CollaborationTransportPayload): unknown
  on(event: string, handler: CollaborationTransportHandler): unknown
  off(event: string, handler: CollaborationTransportHandler): unknown
}

/** Adapt a caller-owned Socket.IO client to the SDK's framework-neutral transport. */
export function createSocketIoTransportAdapter(socket: CollaborationSocketLike): CollaborationTransport {
  return {
    get connected() {
      return socket.connected
    },
    connect: () => {
      socket.connect()
    },
    disconnect: () => {
      socket.disconnect()
    },
    emit: (event, payload = {}) => {
      socket.emit(event, payload)
    },
    on: (event, handler) => {
      socket.on(event, handler)
      return () => {
        socket.off(event, handler)
      }
    }
  }
}

export type CollaborationDocumentUpdateHandler = (update: Uint8Array, origin: unknown) => void

/** Binary CRDT operations required by the generic collaboration client. */
export interface CollaborationBinaryDocumentAdapter {
  applyUpdate(update: Uint8Array, origin: unknown): void
  encodeStateVector(): Uint8Array
  mergeUpdates(updates: Uint8Array[]): Uint8Array
  onUpdate(handler: CollaborationDocumentUpdateHandler): () => void
}

/** Minimal observable Yjs document surface accepted by `createYjsDocumentAdapter`. */
export interface YjsDocumentLike {
  on(event: 'update', handler: CollaborationDocumentUpdateHandler): void
  off(event: 'update', handler: CollaborationDocumentUpdateHandler): void
}

/** Caller-supplied Yjs functions, avoiding a second Yjs runtime in plugin bundles. */
export interface YjsApiLike<TDocument extends YjsDocumentLike> {
  applyUpdate(document: TDocument, update: Uint8Array, origin?: unknown): void
  encodeStateVector(document: TDocument): Uint8Array
  mergeUpdates(updates: Uint8Array[]): Uint8Array
}

/** Wrap a caller-owned `Y.Doc` without passing it across the runtime capability boundary. */
export function createYjsDocumentAdapter<TDocument extends YjsDocumentLike>(
  document: TDocument,
  yjs: YjsApiLike<TDocument>
): CollaborationBinaryDocumentAdapter {
  return {
    applyUpdate: (update, origin) => yjs.applyUpdate(document, update, origin),
    encodeStateVector: () => yjs.encodeStateVector(document),
    mergeUpdates: (updates) => yjs.mergeUpdates(updates),
    onUpdate: (handler) => {
      document.on('update', handler)
      return () => document.off('update', handler)
    }
  }
}

/** Timings, callbacks, transport, and document adapter used by a browser client. */
export type CollaborationClientOptions = {
  session: CollaborationSessionDescriptor
  transport: CollaborationTransport
  document: CollaborationBinaryDocumentAdapter
  initialPresence?: CollaborationPresencePatch
  batchMs?: number
  syncIntervalMs?: number
  presenceHeartbeatMs?: number
  onAck?: (ack: ApplyCollaborationUpdateResult) => void
  onPresence?: (presence: ICollaborationPresence) => void
  onPresenceSnapshot?: (items: ICollaborationPresence[]) => void
  onPresenceRemove?: (clientId: string) => void
  onConnectionChange?: (state: 'connecting' | 'connected' | 'disconnected') => void
  onError?: (error: Error) => void
}

/** Lifecycle and presence controls returned by `createCollaborationClient`. */
export interface CollaborationClient {
  /** Stable origin applied to remote updates so local observers can prevent echo loops. */
  readonly remoteOrigin: object
  connect(): void
  disconnect(): void
  flush(): void
  requestSync(): void
  setPresence(patch: CollaborationPresencePatch): void
}

/**
 * Create a collaboration client with update batching, state-vector repair, presence heartbeat,
 * and reconnect synchronization. The caller retains ownership of the document and transport.
 */
export function createCollaborationClient(options: CollaborationClientOptions): CollaborationClient {
  const remoteOrigin = Object.freeze({ kind: 'platform.collaboration.remote' })
  const batchMs = positiveInteger(options.batchMs, 40)
  const syncIntervalMs = positiveInteger(options.syncIntervalMs, 2_000)
  const presenceHeartbeatMs = positiveInteger(options.presenceHeartbeatMs, 5_000)
  let presence: CollaborationPresencePatch = { ...(options.initialPresence ?? {}) }
  let pending: Uint8Array[] = []
  let flushTimer: ReturnType<typeof setTimeout> | undefined
  let syncTimer: ReturnType<typeof setInterval> | undefined
  let presenceTimer: ReturnType<typeof setInterval> | undefined
  let started = false
  const cleanups: Array<() => void> = []

  const reportError = (error: unknown) => options.onError?.(error instanceof Error ? error : new Error(String(error)))
  const emitPresence = () => options.transport.emit('presence', { ...presence })

  // Merge the short burst of local Yjs transactions into one network update.
  const flush = () => {
    if (flushTimer) clearTimeout(flushTimer)
    flushTimer = undefined
    if (!pending.length || !options.transport.connected) return
    const updates = pending
    pending = []
    options.transport.emit('update', {
      updateBase64: bytesToBase64(options.document.mergeUpdates(updates)),
      origin: 'plugin-client'
    })
  }

  // A state vector lets the server return only bytes missing from this client.
  const requestSync = () => {
    if (!options.transport.connected) return
    options.transport.emit('sync-request', { stateVectorBase64: bytesToBase64(options.document.encodeStateVector()) })
  }

  // Mark server updates with `remoteOrigin` so the document observer does not send them back.
  const applyRemote = (payload: CollaborationTransportPayload) => {
    const encoded = stringValue(payload['updateBase64'])
    if (!encoded) return
    try {
      options.document.applyUpdate(base64ToBytes(encoded), remoteOrigin)
    } catch (error) {
      reportError(error)
    }
  }

  // Register listeners once, then start repair and presence heartbeats before opening the socket.
  const connect = () => {
    if (started) return
    started = true
    options.onConnectionChange?.('connecting')
    cleanups.push(
      options.document.onUpdate((update, origin) => {
        if (origin === remoteOrigin) return
        pending.push(update)
        if (!flushTimer) flushTimer = setTimeout(flush, batchMs)
      })
    )
    cleanups.push(
      options.transport.on('connect', () => {
        options.onConnectionChange?.('connected')
        requestSync()
        emitPresence()
      })
    )
    cleanups.push(options.transport.on('disconnect', () => options.onConnectionChange?.('disconnected')))
    cleanups.push(options.transport.on('sync', applyRemote))
    cleanups.push(options.transport.on('update', applyRemote))
    cleanups.push(
      options.transport.on('update-ack', (payload) => {
        const ack = parseAck(payload)
        if (ack) options.onAck?.(ack)
      })
    )
    cleanups.push(
      options.transport.on('presence', (payload) => {
        const item = parsePresence(payload)
        if (item) options.onPresence?.(item)
      })
    )
    cleanups.push(
      options.transport.on('presence-snapshot', (payload) => {
        const rawItems = payload['items']
        const items = Array.isArray(rawItems) ? rawItems.map(parsePresence).filter(isPresence) : []
        options.onPresenceSnapshot?.(items)
      })
    )
    cleanups.push(
      options.transport.on('presence-remove', (payload) => {
        const clientId = stringValue(payload['clientId'])
        if (clientId) options.onPresenceRemove?.(clientId)
      })
    )
    cleanups.push(
      options.transport.on('error', (payload) =>
        reportError(stringValue(payload['message']) ?? 'Collaboration failed.')
      )
    )
    syncTimer = setInterval(requestSync, syncIntervalMs)
    presenceTimer = setInterval(emitPresence, presenceHeartbeatMs)
    options.transport.connect()
  }

  // Flush best-effort pending state and release all timers/listeners owned by this client.
  const disconnect = () => {
    if (!started) return
    flush()
    started = false
    if (flushTimer) clearTimeout(flushTimer)
    if (syncTimer) clearInterval(syncTimer)
    if (presenceTimer) clearInterval(presenceTimer)
    flushTimer = undefined
    syncTimer = undefined
    presenceTimer = undefined
    while (cleanups.length) cleanups.pop()?.()
    options.transport.disconnect()
    options.onConnectionChange?.('disconnected')
  }

  return {
    remoteOrigin,
    connect,
    disconnect,
    flush,
    requestSync,
    setPresence: (patch) => {
      presence = { ...presence, ...patch }
      if (options.transport.connected) emitPresence()
    }
  }
}

/** Encode bytes in browsers without Node.js `Buffer`; chunks avoid argument-size limits. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)))
  }
  return globalThis.btoa(binary)
}

/** Decode base64 in browsers without requiring Node.js polyfills. */
export function base64ToBytes(value: string): Uint8Array {
  const binary = globalThis.atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function parseAck(payload: CollaborationTransportPayload): ApplyCollaborationUpdateResult | null {
  const documentId = stringValue(payload['documentId'])
  const stateVectorBase64 = stringValue(payload['stateVectorBase64'])
  const sequenceNumber = payload['sequenceNumber']
  if (!documentId || !stateVectorBase64 || typeof sequenceNumber !== 'number') return null
  const materializationStatus = payload['materializationStatus']
  if (materializationStatus !== 'ready' && materializationStatus !== 'pending' && materializationStatus !== 'failed')
    return null
  return {
    documentId,
    duplicate: payload['duplicate'] === true,
    sequenceNumber,
    updateId: stringValue(payload['updateId']),
    stateVectorBase64,
    materializationStatus
  }
}

function parsePresence(value: unknown): ICollaborationPresence | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const item = value as Record<string, unknown>
  const clientId = stringValue(item['clientId'])
  const presenceId = stringValue(item['presenceId'])
  const displayName = stringValue(item['displayName'])
  const color = stringValue(item['color'])
  const actorType = item['actorType']
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
    avatarUrl: nullableString(item['avatarUrl']),
    pageId: nullableString(item['pageId']),
    pointer: parsePointer(item['pointer']),
    focus: parseFocus(item['focus']),
    selection: parseSelection(item['selection']),
    viewport: parseViewport(item['viewport']),
    mode: nullableString(item['mode']),
    status: actorStatus(item['status']),
    toolName: nullableString(item['toolName']),
    operationLabel: nullableString(item['operationLabel']),
    updatedAt: typeof item['updatedAt'] === 'number' ? item['updatedAt'] : Date.now()
  }
}

function parsePointer(value: unknown): ICollaborationPresence['pointer'] {
  const item = recordValue(value)
  if (!item || typeof item['x'] !== 'number' || typeof item['y'] !== 'number') return null
  return { pageId: nullableString(item['pageId']), x: item['x'], y: item['y'], visible: item['visible'] !== false }
}

function parseFocus(value: unknown): ICollaborationPresence['focus'] {
  const item = recordValue(value)
  const kind = item && stringValue(item['kind'])
  if (!item || !kind) return null
  return {
    kind,
    key: nullableString(item['key']),
    pageId: nullableString(item['pageId']),
    elementId: nullableString(item['elementId']),
    fieldKey: nullableString(item['fieldKey'])
  }
}

function parseSelection(value: unknown): ICollaborationPresence['selection'] {
  const item = recordValue(value)
  const kind = item?.['kind']
  if (!item || (kind !== 'text' && kind !== 'elements')) return null
  return {
    kind,
    fieldKey: nullableString(item['fieldKey']),
    elementIds: Array.isArray(item['elementIds'])
      ? item['elementIds'].filter((entry): entry is string => typeof entry === 'string')
      : null,
    anchorRelativeBase64: nullableString(item['anchorRelativeBase64']),
    headRelativeBase64: nullableString(item['headRelativeBase64'])
  }
}

function parseViewport(value: unknown): ICollaborationPresence['viewport'] {
  const item = recordValue(value)
  if (
    !item ||
    typeof item['zoom'] !== 'number' ||
    typeof item['width'] !== 'number' ||
    typeof item['height'] !== 'number'
  )
    return null
  return { zoom: item['zoom'], width: item['width'], height: item['height'] }
}

function recordValue(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function isPresence(value: ICollaborationPresence | null): value is ICollaborationPresence {
  return value !== null
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
function positiveInteger(value: number | undefined, fallback: number) {
  return Number.isFinite(value) && Number(value) > 0 ? Math.trunc(Number(value)) : fallback
}
