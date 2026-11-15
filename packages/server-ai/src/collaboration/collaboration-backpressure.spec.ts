import type { CollaborationBroadcast } from './collaboration.service'
import { CollaborationGateway } from './collaboration.gateway'
import { CollaborationMailbox } from './collaboration-mailbox'
import { sanitizeCellRange } from './collaboration-presence'

function gate() {
    let resolve!: () => void
    const promise = new Promise<void>((done) => {
        resolve = done
    })
    return { promise, resolve }
}
const revision = (value: number): CollaborationBroadcast => ({
    nodeId: 'node',
    documentId: 'doc',
    type: 'revision',
    payload: { documentId: 'doc', revision: value }
})
const tick = () => new Promise<void>((resolve) => setImmediate(resolve))
async function fixture() {
    let listener: (event: CollaborationBroadcast) => void = () => undefined
    const session = { engine: 'operations', documentId: 'doc' }
    const service = {
        onBroadcast: (callback: typeof listener) => {
            listener = callback
            return () => undefined
        },
        resolveSession: async () => session,
        listPresenceForSession: async () => [],
        removePresenceForSession: jest.fn(async () => undefined),
        getRevisionForSession: jest.fn(async () => ({ documentId: 'doc', revision: 1 })),
        assertSessionReadable: jest.fn(async () => undefined),
        upsertPresenceForSession: jest.fn(async () => undefined)
    }
    const client = {
        id: 'client',
        handshake: { auth: { sessionId: 's', clientKey: 'k', documentId: 'doc' }, query: {} },
        join: jest.fn(),
        emit: jest.fn(),
        volatile: { emit: jest.fn() },
        disconnect: jest.fn(),
        conn: { transport: { writable: true } }
    }
    const gateway = new CollaborationGateway(service as never)
    await gateway.handleConnection(client as never)
    client.emit.mockClear()
    return { service, client, gateway, send: (event: CollaborationBroadcast) => listener(event) }
}

afterEach(() => jest.useRealTimers())

it('coalesces 10000 revisions during one live authorization check', async () => {
    const f = await fixture(),
        blocked = gate()
    f.service.assertSessionReadable.mockImplementation(() => blocked.promise)
    for (let i = 1; i <= 10000; i++) f.send(revision(i))
    expect(f.service.assertSessionReadable).toHaveBeenCalledTimes(1)
    blocked.resolve()
    await tick()
    expect(f.client.volatile.emit.mock.calls).toEqual([['revision', { documentId: 'doc', revision: 10000 }]])
    f.gateway.onModuleDestroy()
})

it('drops queued payloads if membership is revoked before authorization completes', async () => {
    const f = await fixture(),
        blocked = gate()
    f.service.assertSessionReadable.mockImplementation(async () => {
        await blocked.promise
        throw new Error('revoked')
    })
    for (let i = 1; i <= 10000; i++) f.send(revision(i))
    blocked.resolve()
    await tick()
    expect(f.client.volatile.emit).not.toHaveBeenCalled()
    expect(f.client.disconnect).toHaveBeenCalledWith(true)
    expect(f.service.removePresenceForSession).toHaveBeenCalledTimes(1)
    f.gateway.onModuleDestroy()
})

it('bounds sync requests and discards a reply after disconnect', async () => {
    const f = await fixture(),
        blocked = gate()
    f.service.getRevisionForSession.mockClear().mockImplementation(async () => {
        await blocked.promise
        return { documentId: 'doc', revision: 2 }
    })
    const pending = f.gateway.sync({}, f.client as never)
    for (let i = 0; i < 10000; i++) void f.gateway.sync({}, f.client as never)
    expect(f.service.getRevisionForSession).toHaveBeenCalledTimes(1)
    await f.gateway.handleDisconnect(f.client as never)
    blocked.resolve()
    await pending
    expect(f.client.emit).not.toHaveBeenCalled()
    f.gateway.onModuleDestroy()
})

it('retains only the latest presence while a write is blocked and cancels timers on teardown', async () => {
    jest.useFakeTimers()
    const f = await fixture(),
        blocked = gate()
    f.service.upsertPresenceForSession.mockImplementation(() => blocked.promise)
    for (let i = 0; i < 10000; i++) f.gateway.presence({ pointer: { x: i, y: 0 } }, f.client as never)
    await jest.advanceTimersByTimeAsync(120)
    expect(f.service.upsertPresenceForSession).toHaveBeenCalledTimes(1)
    expect(f.service.upsertPresenceForSession).toHaveBeenNthCalledWith(
        1,
        expect.anything(),
        'client',
        expect.objectContaining({ pointer: expect.objectContaining({ x: 9999 }) })
    )
    for (let i = 10000; i < 20000; i++) f.gateway.presence({ pointer: { x: i, y: 0 } }, f.client as never)
    blocked.resolve()
    await jest.advanceTimersByTimeAsync(120)
    expect(f.service.upsertPresenceForSession).toHaveBeenCalledTimes(2)
    expect(f.service.upsertPresenceForSession).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        'client',
        expect.objectContaining({ pointer: expect.objectContaining({ x: 19999 }) })
    )
    f.gateway.presence({}, f.client as never)
    f.gateway.onModuleDestroy()
    await jest.advanceTimersByTimeAsync(1000)
    expect(f.service.upsertPresenceForSession).toHaveBeenCalledTimes(2)
})

it('forces reconnect on a full durable delta queue and never emits after disconnect', async () => {
    const f = await fixture(),
        blocked = gate()
    f.service.assertSessionReadable.mockImplementation(() => blocked.promise)
    for (let i = 0; i < 65; i++)
        f.send({ nodeId: 'node', documentId: 'doc', type: 'update', payload: { sequenceNumber: i } })
    expect(f.client.disconnect).toHaveBeenCalledWith(true)
    blocked.resolve()
    await tick()
    expect(f.client.emit).not.toHaveBeenCalled()
    f.gateway.onModuleDestroy()
})

it('bounds durable bytes and ephemeral actors while preserving delta order', () => {
    const queue = new CollaborationMailbox()
    const delta: CollaborationBroadcast = {
        nodeId: 'node',
        documentId: 'doc',
        type: 'update',
        payload: { updateBase64: 'a'.repeat(1024 * 1024) }
    }
    expect(queue.push(delta)).toBe(true)
    expect(queue.push(delta)).toBe(false)
    expect(queue.take()).toEqual(delta)
    for (let i = 0; i < 1000; i++)
        queue.push({ nodeId: 'node', documentId: 'doc', type: 'presence', payload: { clientId: String(i) } })
    const actors: string[] = []
    while (queue.pending) {
        const event = queue.take()!
        if (event.type === 'presence') actors.push(String(event.payload.clientId))
        else throw new Error('Expected presence')
    }
    expect(actors).toHaveLength(128)
    expect(actors[0]).toBe('872')
    queue.push(revision(10))
    queue.push(revision(2))
    expect(queue.take()).toEqual(revision(10))
})

it('does not buffer durable broadcasts in a blocked transport', async () => {
    const f = await fixture()
    f.client.conn.transport.writable = false
    f.send({ nodeId: 'node', documentId: 'doc', type: 'update', payload: { updateBase64: 'delta' } })
    await tick()
    expect(f.client.emit).not.toHaveBeenCalled()
    expect(f.client.disconnect).toHaveBeenCalledWith(true)
    f.gateway.onModuleDestroy()
})

it('preserves valid selection bases and rejects invalid versions without downgrading', () => {
    const cells = { sheetId: 's', startRow: 0, endRow: 0, startColumn: 0, endColumn: 0 }
    expect(sanitizeCellRange({ ...cells, baseRevision: 4 })).toEqual({ ...cells, baseRevision: 4 })
    expect(sanitizeCellRange(cells)).toEqual(cells)
    for (const baseRevision of [0, -1, 1.5, NaN, '4', null, Number.MAX_SAFE_INTEGER + 1]) {
        expect(sanitizeCellRange({ ...cells, baseRevision })).toBeNull()
    }
})
