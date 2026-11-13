import { createOperationCollaborationClient } from './operations-client'
import type { CollaborationTransport, CollaborationTransportHandler } from './transport'
import type { CollaborationSessionDescriptor } from './types'

// Enforce the dependency boundary even if a future refactor restores an indirect import.
jest.mock('./client', () => {
  throw new Error('Operations must not load the Yjs client')
})

function fixture() {
  const listeners = new Map<string, CollaborationTransportHandler>()
  const transport: CollaborationTransport = {
    connected: true,
    clientId: 'self',
    connect: jest.fn(),
    disconnect: jest.fn(),
    emit: jest.fn(),
    on(event, handler) {
      listeners.set(event, handler)
      return () => {
        listeners.delete(event)
      }
    }
  }
  const session: CollaborationSessionDescriptor = {
    engine: 'operations',
    sessionId: 'session',
    clientKey: 'key',
    documentId: 'doc',
    connectionUrl: 'http://localhost',
    namespace: '/api/collaboration',
    access: 'read',
    expiresAt: Date.now() + 600000,
    actor: { presenceId: 'me', actorType: 'user', displayName: 'Me', color: '#000000' }
  }
  const onRevision = jest.fn(),
    onPresence = jest.fn(),
    onConnection = jest.fn(),
    onError = jest.fn()
  const client = createOperationCollaborationClient({
    session,
    transport,
    onRevision,
    onPresence,
    onConnection,
    onError
  })
  return { client, listeners, transport, onRevision, onPresence, onConnection, onError, session }
}
afterEach(() => jest.useRealTimers())
it('deduplicates unordered notifications and rejects another resource or malformed cursor', () => {
  jest.useFakeTimers()
  const f = fixture()
  for (const revision of [3, 3, 2, 4, NaN, -1]) f.listeners.get('revision')!({ documentId: 'doc', revision })
  f.listeners.get('revision')!({ documentId: 'other', revision: 500 })
  expect(f.onRevision.mock.calls).toEqual([[3], [4]])
  f.client.disconnect()
  expect(f.listeners.size).toBe(0)
  jest.advanceTimersByTime(60000)
  expect(f.transport.emit).not.toHaveBeenCalled()
})
it('reconciles after reconnect and bounds/expires ephemeral presence', () => {
  jest.useFakeTimers()
  const f = fixture()
  f.listeners.get('connect')!({})
  expect(f.transport.emit).toHaveBeenCalledWith('sync-request', {})
  const items = Array.from({ length: 200 }, (_, i) => ({
    clientId: String(i),
    presenceId: String(i),
    displayName: 'User',
    actorType: 'user',
    color: '#123456',
    updatedAt: Date.now(),
    selection: { kind: 'cells', cells: { sheetId: 'sheet', startRow: 0, endRow: 1, startColumn: 0, endColumn: 2 } }
  }))
  f.listeners.get('presence-snapshot')!({ selfClientId: 'self', items })
  expect(f.onPresence.mock.calls.at(-1)[0]).toHaveLength(128)
  expect(f.onPresence.mock.calls.at(-1)[0][0].selection.kind).toBe('cells')
  jest.advanceTimersByTime(20000)
  expect(f.onPresence.mock.calls.at(-1)[0]).toHaveLength(0)
  f.client.disconnect()
})
it('disconnects at session expiry without retaining credentials or listeners', () => {
  jest.useFakeTimers()
  const f = fixture()
  f.session.expiresAt = Date.now() + 1
  jest.advanceTimersByTime(5000)
  expect(f.onError).toHaveBeenCalled()
  expect(f.transport.disconnect).toHaveBeenCalledTimes(1)
  expect(f.listeners.size).toBe(0)
})

it('preserves a selection revision and rejects a malformed basis instead of presenting unversioned coordinates', () => {
  jest.useFakeTimers()
  const f = fixture()
  const cells = { sheetId: 's', startRow: 0, endRow: 0, startColumn: 0, endColumn: 0, baseRevision: 7 }
  const presence = {
    clientId: 'other',
    presenceId: 'other',
    displayName: 'Other',
    actorType: 'user',
    color: '#123456',
    updatedAt: Date.now(),
    selection: { kind: 'cells', cells }
  }
  f.listeners.get('presence')!(presence)
  expect(f.onPresence.mock.calls.at(-1)[0][0].selection.cells.baseRevision).toBe(7)
  for (const baseRevision of [0, -1, 1.5, null, '7']) {
    f.listeners.get('presence')!({ ...presence, selection: { kind: 'cells', cells: { ...cells, baseRevision } } })
    expect(f.onPresence.mock.calls.at(-1)[0][0].selection).toBeNull()
  }
  f.client.disconnect()
})

it.each(['yjs', undefined] as const)('rejects a %s session before registering transport work', (engine) => {
  jest.useFakeTimers()
  const f = fixture()
  f.client.disconnect()
  f.session.engine = engine
  expect(() => createOperationCollaborationClient(f)).toThrow('Operation collaboration protocol required')
  expect(f.listeners.size).toBe(0)
  expect(jest.getTimerCount()).toBe(0)
})

it('uses only presence and revision repair, without accepting or submitting Yjs updates', () => {
  jest.useFakeTimers()
  const f = fixture()
  f.listeners.get('connect')!({})
  f.client.setPresence({ mode: 'edit' })
  jest.advanceTimersByTime(15000)
  expect(f.transport.emit).toHaveBeenCalledWith('presence', { mode: 'edit' })
  expect(f.transport.emit).toHaveBeenCalledWith('sync-request', {})
  expect(f.transport.emit).not.toHaveBeenCalledWith('update', expect.anything())
  for (const event of ['sync', 'update', 'update-ack']) expect(f.listeners.has(event)).toBe(false)
  f.client.disconnect()
})
