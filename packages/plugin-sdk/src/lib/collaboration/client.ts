import type { CollaborationTransport, CollaborationTransportPayload } from './transport'
import { parseCollaborationPresence, type CollaborationPresenceSnapshotMetadata } from './presence'

// Preserve existing imports while protocol-neutral code lives outside the Yjs client.
export * from './transport'
export * from './presence'

import type {
  ApplyCollaborationUpdateResult,
  CollaborationPresencePatch,
  CollaborationSessionDescriptor,
  ICollaborationPresence
} from './types'

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
  /** Remove a presence locally when no refresh has been received within this interval. */
  presenceStaleMs?: number
  onAck?: (ack: ApplyCollaborationUpdateResult) => void
  onPresence?: (presence: ICollaborationPresence) => void
  onPresenceSnapshot?: (items: ICollaborationPresence[], metadata: CollaborationPresenceSnapshotMetadata) => void
  onPresenceRemove?: (clientId: string) => void
  onConnectionChange?: (state: 'connecting' | 'connected' | 'disconnected') => void
  onError?: (error: Error) => void
}

/** Lifecycle and presence controls returned by `createCollaborationClient`. */
export interface CollaborationClient {
  /** Stable origin applied to remote updates so local observers can prevent echo loops. */
  readonly remoteOrigin: object
  /** Socket id for this exact tab/device; distinct from the stable actor `presenceId`. */
  readonly selfClientId: string | null
  connect(): void
  disconnect(): void
  flush(): void
  requestSync(): void
  setPresence(patch: CollaborationPresencePatch): void
}

/**
 * Create a Yjs collaboration client with update batching, state-vector repair, presence heartbeat,
 * and reconnect synchronization. The caller retains ownership of the document and transport.
 */
export function createCollaborationClient(options: CollaborationClientOptions): CollaborationClient {
  // Legacy sessions omit engine and use Yjs; operations must use its notification client.
  if (options.session.engine && options.session.engine !== 'yjs') {
    throw new Error('Yjs collaboration protocol required')
  }
  const remoteOrigin = Object.freeze({ kind: 'platform.collaboration.remote' })
  const batchMs = positiveInteger(options.batchMs, 40)
  const syncIntervalMs = positiveInteger(options.syncIntervalMs, 2_000)
  const presenceHeartbeatMs = positiveInteger(options.presenceHeartbeatMs, 5_000)
  const presenceStaleMs = positiveInteger(options.presenceStaleMs, 15_000)
  let presence: CollaborationPresencePatch = { ...(options.initialPresence ?? {}) }
  let pending: Uint8Array[] = []
  let inFlight: Uint8Array[] = []
  let synchronized = false
  let flushTimer: ReturnType<typeof setTimeout> | undefined
  let syncTimer: ReturnType<typeof setInterval> | undefined
  let presenceTimer: ReturnType<typeof setInterval> | undefined
  let presenceCleanupTimer: ReturnType<typeof setInterval> | undefined
  let selfClientId: string | null = options.transport.clientId ?? null
  let started = false
  const cleanups: Array<() => void> = []
  const presenceSeenAt = new Map<string, number>()

  const reportError = (error: unknown) => options.onError?.(error instanceof Error ? error : new Error(String(error)))
  const emitPresence = () => options.transport.emit('presence', { ...presence })

  // Merge the short burst of local Yjs transactions into one network update.
  const flush = () => {
    if (flushTimer) clearTimeout(flushTimer)
    flushTimer = undefined
    if (!pending.length || inFlight.length || !synchronized || !options.transport.connected) return
    const updates = pending
    pending = []
    // Keep bytes until the server acknowledges persistence. Replaying a Yjs update
    // after a lost acknowledgement is idempotent; dropping it could lose an edit.
    inFlight = updates
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
        if (origin === remoteOrigin || options.session.access !== 'write') return
        pending.push(update)
        if (!flushTimer) flushTimer = setTimeout(flush, batchMs)
      })
    )
    cleanups.push(
      options.transport.on('connect', () => {
        synchronized = false
        selfClientId = options.transport.clientId ?? selfClientId
        options.onConnectionChange?.('connected')
        requestSync()
        emitPresence()
      })
    )
    cleanups.push(
      options.transport.on('disconnect', () => {
        synchronized = false
        pending = [...inFlight, ...pending]
        inFlight = []
        options.onConnectionChange?.('disconnected')
      })
    )
    cleanups.push(
      options.transport.on('sync', (payload) => {
        applyRemote(payload)
        // The initial sync is sent only after session authorization and room setup.
        // A raw socket connect can precede that setup, so do not flush on connect.
        if (stringValue(payload['updateBase64'])) {
          synchronized = true
          flush()
        }
      })
    )
    cleanups.push(options.transport.on('update', applyRemote))
    cleanups.push(
      options.transport.on('update-ack', (payload) => {
        const ack = parseAck(payload)
        if (ack && ack.documentId === options.session.documentId) {
          inFlight = []
          options.onAck?.(ack)
          flush()
        }
      })
    )
    cleanups.push(
      options.transport.on('presence', (payload) => {
        const item = parseCollaborationPresence(payload)
        if (item) {
          presenceSeenAt.set(item.clientId, Date.now())
          options.onPresence?.(item)
        }
      })
    )
    cleanups.push(
      options.transport.on('presence-snapshot', (payload) => {
        const rawItems = payload['items']
        const items = Array.isArray(rawItems) ? rawItems.map(parseCollaborationPresence).filter(isPresence) : []
        selfClientId = stringValue(payload['selfClientId']) ?? options.transport.clientId ?? selfClientId
        presenceSeenAt.clear()
        for (const item of items) presenceSeenAt.set(item.clientId, Date.now())
        options.onPresenceSnapshot?.(items, { selfClientId })
      })
    )
    cleanups.push(
      options.transport.on('presence-remove', (payload) => {
        const clientId = stringValue(payload['clientId'])
        if (clientId) {
          presenceSeenAt.delete(clientId)
          options.onPresenceRemove?.(clientId)
        }
      })
    )
    cleanups.push(
      options.transport.on('error', (payload) =>
        reportError(stringValue(payload['message']) ?? 'Collaboration failed.')
      )
    )
    syncTimer = setInterval(requestSync, syncIntervalMs)
    presenceTimer = setInterval(emitPresence, presenceHeartbeatMs)
    presenceCleanupTimer = setInterval(
      () => {
        const cutoff = Date.now() - presenceStaleMs
        for (const [clientId, seenAt] of presenceSeenAt) {
          if (clientId === selfClientId || seenAt >= cutoff) continue
          presenceSeenAt.delete(clientId)
          options.onPresenceRemove?.(clientId)
        }
      },
      Math.min(5_000, Math.max(1_000, Math.floor(presenceStaleMs / 3)))
    )
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
    if (presenceCleanupTimer) clearInterval(presenceCleanupTimer)
    flushTimer = undefined
    syncTimer = undefined
    presenceTimer = undefined
    presenceCleanupTimer = undefined
    presenceSeenAt.clear()
    while (cleanups.length) cleanups.pop()?.()
    options.transport.disconnect()
    options.onConnectionChange?.('disconnected')
  }

  return {
    get selfClientId() {
      return selfClientId
    },
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

function isPresence(value: ICollaborationPresence | null): value is ICollaborationPresence {
  return value !== null
}
function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
function positiveInteger(value: number | undefined, fallback: number) {
  return Number.isFinite(value) && Number(value) > 0 ? Math.trunc(Number(value)) : fallback
}
