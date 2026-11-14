import { parseCollaborationPresence } from './presence'
import type { CollaborationTransport } from './transport'
import type { CollaborationPresencePatch, CollaborationSessionDescriptor, ICollaborationPresence } from './types'

export type OperationCollaborationOptions = {
  session: CollaborationSessionDescriptor
  transport: CollaborationTransport
  /** Invalidate/refetch domain state; this is neither an operation payload nor a save acknowledgement. */
  onRevision(revision: number): void
  onPresence(items: ICollaborationPresence[], selfClientId: string | null): void
  onConnection(state: 'connected' | 'disconnected'): void
  onError(error: Error): void
}

/**
 * Notification client for a domain-owned operation log, not an OT/CRDT implementation.
 * The domain API owns writes, validation, conflict handling and persistence. This client
 * only tracks committed revisions and ephemeral presence; it never submits business edits.
 * Revisions coalesce to one high-water mark, so consumers must refetch authoritative state.
 */
export function createOperationCollaborationClient(options: OperationCollaborationOptions) {
  if (options.session.engine !== 'operations') throw new Error('Operation collaboration protocol required')
  const { transport, session } = options
  const presence = new Map<string, ICollaborationPresence>()
  let revision = -1,
    stopped = false,
    selfClientId: string | null = null
  let patch: CollaborationPresencePatch = {}
  let presenceTimer: ReturnType<typeof setTimeout> | undefined
  const changed = () => options.onPresence([...presence.values()], selfClientId)
  const addPresence = (value: unknown) => {
    const item = parseCollaborationPresence(value)
    if (!item || (presence.size >= 128 && !presence.has(item.clientId))) return
    presence.set(item.clientId, item)
  }
  // Repair missed invalidations on reconnect/periodic sync; no Yjs state vector is involved.
  const sync = () => {
    if (!stopped && transport.connected) transport.emit('sync-request', {})
  }
  const heartbeat = () => {
    if (stopped) return
    if (Date.now() >= session.expiresAt) {
      options.onError(new Error('Collaboration session expired'))
      disconnect()
      return
    }
    if (transport.connected) transport.emit('presence', patch)
    for (const [id, item] of presence) if (item.updatedAt < Date.now() - 15000) presence.delete(id)
    changed()
  }
  const stops = [
    transport.on('connect', () => {
      selfClientId = transport.clientId ?? null
      options.onConnection('connected')
      sync()
      heartbeat()
    }),
    transport.on('disconnect', () => {
      presence.clear()
      changed()
      options.onConnection('disconnected')
    }),
    transport.on('revision', (value) => {
      if (
        value['documentId'] !== session.documentId ||
        typeof value['revision'] !== 'number' ||
        !Number.isSafeInteger(value['revision']) ||
        value['revision'] < 0 ||
        value['revision'] <= revision
      )
        return
      revision = value['revision']
      options.onRevision(revision)
    }),
    transport.on('presence-snapshot', (value) => {
      presence.clear()
      selfClientId = typeof value['selfClientId'] === 'string' ? value['selfClientId'] : (transport.clientId ?? null)
      if (Array.isArray(value['items'])) value['items'].slice(0, 128).forEach(addPresence)
      changed()
    }),
    transport.on('presence', (value) => {
      addPresence(value)
      changed()
    }),
    transport.on('presence-remove', (value) => {
      if (typeof value['clientId'] === 'string') presence.delete(value['clientId'])
      changed()
    }),
    transport.on('error', (value) =>
      options.onError(new Error(typeof value['message'] === 'string' ? value['message'] : 'Collaboration disconnected'))
    )
  ]
  const heartbeatTimer = setInterval(heartbeat, 5000),
    syncTimer = setInterval(sync, 15000)
  function disconnect() {
    if (stopped) return
    stopped = true
    clearInterval(heartbeatTimer)
    clearInterval(syncTimer)
    clearTimeout(presenceTimer)
    stops.forEach((stop) => stop())
    transport.disconnect()
    presence.clear()
    changed()
    options.onConnection('disconnected')
  }
  return {
    connect() {
      if (!stopped) transport.connect()
    },
    disconnect,
    requestSync: sync,
    setPresence(value: CollaborationPresencePatch) {
      patch = value
      if (!stopped && !presenceTimer)
        presenceTimer = setTimeout(() => {
          presenceTimer = undefined
          if (transport.connected && !stopped) transport.emit('presence', patch)
        }, 120)
    }
  }
}
