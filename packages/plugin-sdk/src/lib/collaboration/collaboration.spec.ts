import { CollaborationRuntimeCapability } from './runtime-capability'
import {
  base64ToBytes,
  bytesToBase64,
  createCollaborationClient,
  type CollaborationBinaryDocumentAdapter,
  type CollaborationTransport,
  type CollaborationTransportHandler
} from './client'

class TestTransport implements CollaborationTransport {
  connected = false
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
})
