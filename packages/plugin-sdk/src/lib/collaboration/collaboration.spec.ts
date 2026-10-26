import { CollaborationRuntimeCapability } from './runtime-capability'
import {
  base64ToBytes,
  bytesToBase64,
  createCollaborationClient,
  createCollaborationPresenceStore,
  type CollaborationBinaryDocumentAdapter,
  type CollaborationTransport,
  type CollaborationTransportHandler
} from './client'
import type { ICollaborationPresence } from './types'

class TestTransport implements CollaborationTransport {
  connected = false
  clientId: string | null = 'socket-self'
  readonly emitted: Array<{ event: string; payload: Record<string, unknown> }> = []
  private readonly handlers = new Map<string, Set<CollaborationTransportHandler>>()

  connect() {
    this.connected = true
    this.dispatch('connect', {})
  }

  disconnect() {
    this.connected = false
  }

  emit(event: string, payload: Record<string, unknown> = {}) {
    this.emitted.push({ event, payload })
  }

  on(event: string, handler: CollaborationTransportHandler) {
    const handlers = this.handlers.get(event) ?? new Set<CollaborationTransportHandler>()
    handlers.add(handler)
    this.handlers.set(event, handlers)
    return () => handlers.delete(handler)
  }

  dispatch(event: string, payload: Record<string, unknown>) {
    for (const handler of this.handlers.get(event) ?? []) handler(payload)
  }
}

class TestDocument implements CollaborationBinaryDocumentAdapter {
  readonly applied: Array<{ update: Uint8Array; origin: unknown }> = []
  private readonly handlers = new Set<(update: Uint8Array, origin: unknown) => void>()

  applyUpdate(update: Uint8Array, origin: unknown) {
    this.applied.push({ update, origin })
  }

  encodeStateVector() {
    return new Uint8Array([7])
  }

  mergeUpdates(updates: Uint8Array[]) {
    return Uint8Array.from(updates.flatMap((update) => [...update]))
  }

  onUpdate(handler: (update: Uint8Array, origin: unknown) => void) {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  update(update: Uint8Array, origin: unknown = 'local') {
    for (const handler of this.handlers) handler(update, origin)
  }
}

describe('platform collaboration SDK', () => {
  afterEach(() => jest.useRealTimers())

  it('exposes the platform.collaboration runtime capability', () => {
    expect(CollaborationRuntimeCapability.id).toBe('platform.collaboration')
  })

  it('round-trips browser-safe base64 payloads', () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255])
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes)
  })

  it('batches local updates, synchronizes on connect, and ignores remote echoes', () => {
    jest.useFakeTimers()
    const transport = new TestTransport()
    const document = new TestDocument()
    const client = createCollaborationClient({
      session: {
        sessionId: 'session',
        clientKey: 'key',
        documentId: 'document',
        namespace: '/api/collaboration',
        connectionUrl: 'http://localhost:3000/api/collaboration',
        access: 'write',
        actor: { presenceId: 'presence', actorType: 'user', displayName: 'User', color: '#000000' },
        expiresAt: Date.now() + 60_000
      },
      transport,
      document,
      batchMs: 40
    })

    client.connect()
    expect(transport.emitted.map(({ event }) => event)).toEqual(['sync-request', 'presence'])
    transport.dispatch('sync', { updateBase64: bytesToBase64(new Uint8Array([0])) })
    document.applied.length = 0

    document.update(new Uint8Array([1]))
    document.update(new Uint8Array([2]))
    jest.advanceTimersByTime(40)
    expect(transport.emitted.at(-1)).toEqual({
      event: 'update',
      payload: { updateBase64: bytesToBase64(new Uint8Array([1, 2])), origin: 'plugin-client' }
    })

    transport.dispatch('update', { updateBase64: bytesToBase64(new Uint8Array([3])) })
    expect(document.applied).toEqual([{ update: new Uint8Array([3]), origin: client.remoteOrigin }])
    document.update(new Uint8Array([3]), client.remoteOrigin)
    jest.advanceTimersByTime(40)
    expect(transport.emitted.filter(({ event }) => event === 'update')).toHaveLength(1)

    client.disconnect()
    expect(transport.connected).toBe(false)
  })

  it('resends unacknowledged and offline edits only after an authorized reconnect sync', () => {
    jest.useFakeTimers()
    const transport = new TestTransport(),
      document = new TestDocument()
    const client = createCollaborationClient({ session: testSession(), transport, document })
    const sync = () => transport.dispatch('sync', { updateBase64: bytesToBase64(new Uint8Array([0])) })
    client.connect()
    sync()
    document.update(new Uint8Array([1]))
    jest.advanceTimersByTime(40)
    transport.connected = false
    transport.dispatch('disconnect', {})
    document.update(new Uint8Array([2]))
    jest.advanceTimersByTime(40)
    transport.connect()
    expect(transport.emitted.filter((x) => x.event === 'update')).toHaveLength(1)
    sync()
    expect(transport.emitted.filter((x) => x.event === 'update').at(-1)?.payload.updateBase64).toBe(
      bytesToBase64(new Uint8Array([1, 2]))
    )
    document.update(new Uint8Array([3]))
    jest.advanceTimersByTime(40)
    expect(transport.emitted.filter((x) => x.event === 'update')).toHaveLength(2)
    transport.dispatch('update-ack', {
      documentId: 'document',
      stateVectorBase64: 'AA==',
      sequenceNumber: 2,
      materializationStatus: 'ready'
    })
    expect(transport.emitted.filter((x) => x.event === 'update').at(-1)?.payload.updateBase64).toBe(
      bytesToBase64(new Uint8Array([3]))
    )
    client.disconnect()
  })

  it('does not enqueue edits for a read-only collaboration session', () => {
    jest.useFakeTimers()
    const transport = new TestTransport(),
      document = new TestDocument()
    const client = createCollaborationClient({ session: { ...testSession(), access: 'read' }, transport, document })
    client.connect()
    transport.dispatch('sync', { updateBase64: 'AA==' })
    document.update(new Uint8Array([1]))
    jest.advanceTimersByTime(40)
    expect(transport.emitted.filter((x) => x.event === 'update')).toHaveLength(0)
    client.disconnect()
  })

  it('keeps actor identity separate from browser client identity', () => {
    const selfActor = { presenceId: 'user-1', actorType: 'user' as const, displayName: 'User', color: '#111111' }
    const snapshots: Array<ReturnType<ReturnType<typeof createCollaborationPresenceStore>['snapshot']>> = []
    const store = createCollaborationPresenceStore({ selfActor, onChange: (snapshot) => snapshots.push(snapshot) })
    store.replace(
      [
        presence({ clientId: 'socket-self', presenceId: 'user-1', displayName: 'User' }),
        presence({ clientId: 'socket-other-tab', presenceId: 'user-1', displayName: 'User' }),
        presence({ clientId: 'socket-user-2', presenceId: 'user-2', displayName: 'Other' })
      ],
      'socket-self'
    )

    const snapshot = store.snapshot()
    expect(snapshot.remoteSessions.map(({ clientId }) => clientId)).toEqual(['socket-other-tab', 'socket-user-2'])
    expect(snapshot.collaborators.map(({ presenceId }) => presenceId)).toEqual(['user-1', 'user-2'])
    expect(snapshots).toHaveLength(1)
  })

  it('reports selfClientId and removes silent remote presence locally', () => {
    jest.useFakeTimers()
    const transport = new TestTransport()
    const removed: string[] = []
    const snapshots: Array<{ selfClientId: string | null }> = []
    const client = createCollaborationClient({
      session: testSession(),
      transport,
      document: new TestDocument(),
      presenceStaleMs: 3_000,
      onPresenceSnapshot: (_items, metadata) => snapshots.push(metadata),
      onPresenceRemove: (clientId) => removed.push(clientId)
    })

    client.connect()
    transport.dispatch('presence-snapshot', { selfClientId: 'socket-self', items: [] })
    transport.dispatch('presence', presence({ clientId: 'socket-remote', presenceId: 'user-2' }))
    expect(client.selfClientId).toBe('socket-self')
    expect(snapshots).toEqual([{ selfClientId: 'socket-self' }])

    jest.advanceTimersByTime(4_000)
    expect(removed).toEqual(['socket-remote'])
    client.disconnect()
  })
})

function testSession() {
  return {
    sessionId: 'session',
    clientKey: 'key',
    documentId: 'document',
    namespace: '/api/collaboration',
    connectionUrl: 'http://localhost:3000/api/collaboration',
    access: 'write' as const,
    actor: { presenceId: 'user-1', actorType: 'user' as const, displayName: 'User', color: '#000000' },
    expiresAt: Date.now() + 60_000
  }
}

function presence(
  patch: Partial<ICollaborationPresence> & Pick<ICollaborationPresence, 'clientId' | 'presenceId'>
): ICollaborationPresence {
  return {
    clientId: patch.clientId,
    presenceId: patch.presenceId,
    actorType: patch.actorType ?? 'user',
    displayName: patch.displayName ?? 'Remote',
    color: patch.color ?? '#222222',
    avatarUrl: patch.avatarUrl ?? null,
    pageId: patch.pageId ?? null,
    pointer: patch.pointer ?? null,
    focus: patch.focus ?? null,
    selection: patch.selection ?? null,
    viewport: patch.viewport ?? null,
    mode: patch.mode ?? null,
    status: patch.status ?? null,
    toolName: patch.toolName ?? null,
    operationLabel: patch.operationLabel ?? null,
    updatedAt: patch.updatedAt ?? Date.now()
  }
}
