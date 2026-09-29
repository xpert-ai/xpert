import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import type { RedisClientType } from 'redis'
import type { Socket } from 'socket.io'
import { DesktopShellGateway } from './desktop-shell.gateway'
import { DesktopShellAuthService } from './desktop-shell-auth.service'
import { DesktopShellOperationService, SHELL_DISPATCH_CHANNEL } from './desktop-shell-operation.service'

jest.mock('@xpert-ai/server-core', () => ({ TenantOrganizationBaseEntity: class {}, REDIS_CLIENT: 'REDIS_CLIENT' }))
jest.mock('@xpert-ai/plugin-sdk', () => ({ RequestContext: {} }))
jest.mock('i18next', () => ({ t: (_key: string, opts: { defaultValue: string }) => opts.defaultValue }))

function fixture() {
    const device = {
        id: randomUUID(),
        enabled: true,
        connectionEpoch: '',
        credentialExpiresAt: new Date(Date.now() + 60000),
        leaseExpiresAt: new Date()
    }
    const grant = { id: randomUUID(), enabled: true, expiresAt: new Date(Date.now() + 60000) }
    const operation = {
        id: randomUUID(),
        deviceId: device.id,
        grantId: grant.id,
        state: 'pending',
        argsHash: 'a'.repeat(64),
        command: 'pwd',
        cwd: '/tmp',
        timeoutSec: 30,
        deadline: new Date(Date.now() + 30000)
    }
    const callbacks = new Set<(id: string) => void>()
    const redis = {
        duplicate: () => {
            let callback: (id: string) => void
            return {
                on: jest.fn(),
                connect: async () => undefined,
                subscribe: async (_channel: string, cb: (id: string) => void) => {
                    callback = cb
                    callbacks.add(cb)
                },
                quit: async () => {
                    callbacks.delete(callback)
                }
            }
        },
        publish: async (_channel: string, id: string) => {
            for (const cb of callbacks) cb(id)
        }
    }
    const match = (value: object, where: object) =>
        Object.entries(where).every(([key, val]) => Reflect.get(value, key) === val)
    const auth = {
        authenticate: async (token: string) => {
            if (token !== device.id) throw new Error('denied')
            return device
        },
        devices: {
            findOneBy: async (where: object) => (match(device, where) ? { ...device } : null),
            update: async (where: string | object, patch: object) => {
                if (typeof where === 'string' ? where === device.id : match(device, where)) Object.assign(device, patch)
            }
        },
        grants: { findOneBy: async () => (grant.enabled ? grant : null) },
        operations: {
            findBy: async (where: { deviceId: string }) => (where.deviceId === device.id ? [operation] : []),
            update: jest.fn(async () => undefined)
        }
    }
    const operations = { receive: jest.fn(async () => true) }
    const gateways: DesktopShellGateway[] = []
    const gateway = async () => {
        const value = new DesktopShellGateway(
            auth as unknown as DesktopShellAuthService,
            operations as unknown as DesktopShellOperationService,
            redis as unknown as RedisClientType
        )
        gateways.push(value)
        await value.onModuleInit()
        return value
    }
    const socket = () => ({
        id: randomUUID(),
        handshake: { auth: { version: 1, token: device.id } },
        emit: jest.fn(),
        disconnect: jest.fn()
    })
    const cleanup = () => Promise.all(gateways.map((g) => g.onModuleDestroy()))
    const publish = async () => {
        await redis.publish(SHELL_DISPATCH_CHANNEL, device.id)
        await new Promise((resolve) => setImmediate(resolve))
    }
    return { device, grant, operation, auth, operations, gateway, socket, cleanup, publish }
}

describe('Desktop Shell Gateway', () => {
    it('routes a Redis wake-up only through the API instance owning the device', async () => {
        const f = fixture()
        try {
            const first = await f.gateway(),
                second = await f.gateway()
            const socket = f.socket()
            await first.handleConnection(socket as unknown as Socket)
            socket.emit.mockClear()
            // Cancellation bypasses the exec resend interval and wakes every API instance.
            f.operation.state = 'cancel_requested'
            await f.publish()
            expect(socket.emit.mock.calls.filter(([event]) => event === 'command')).toHaveLength(1)
            expect(socket.emit).toHaveBeenCalledWith(
                'command',
                expect.objectContaining({ type: 'cancel', operationId: f.operation.id })
            )
            await second.heartbeat(f.socket() as unknown as Socket)
        } finally {
            await f.cleanup()
        }
    })
    it('fences the previous API connection epoch and rejects its reports', async () => {
        const f = fixture()
        try {
            const first = await f.gateway(),
                second = await f.gateway(),
                old = f.socket(),
                current = f.socket()
            await first.handleConnection(old as unknown as Socket)
            const oldEpoch = f.device.connectionEpoch
            await second.handleConnection(current as unknown as Socket)
            await first.report(
                {
                    version: 1,
                    operationId: f.operation.id,
                    connectionEpoch: oldEpoch,
                    type: 'state',
                    state: 'succeeded',
                    seq: 1,
                    exitCode: 0,
                    truncated: false
                },
                old as unknown as Socket
            )
            expect(f.operations.receive).not.toHaveBeenCalled()
            await first.heartbeat(old as unknown as Socket)
            expect(old.disconnect).toHaveBeenCalledWith(true)
        } finally {
            await f.cleanup()
        }
    })
    it('acknowledges durable reports with the exact report identity', async () => {
        const f = fixture()
        try {
            const gateway = await f.gateway(),
                socket = f.socket()
            await gateway.handleConnection(socket as unknown as Socket)
            const report = {
                version: 1,
                operationId: f.operation.id,
                connectionEpoch: f.device.connectionEpoch,
                type: 'output',
                state: 'running',
                seq: 1,
                stream: 'stdout',
                data: 'test'
            }
            await gateway.report(report, socket as unknown as Socket)
            expect(f.operations.receive).toHaveBeenCalledWith(f.device.id, report)
            expect(socket.emit).toHaveBeenCalledWith('ack', {
                operationId: f.operation.id,
                seq: 1,
                type: 'output',
                state: 'running'
            })
            f.operations.receive.mockResolvedValue(false)
            await gateway.report(report, socket as unknown as Socket)
            expect(socket.emit).toHaveBeenCalledWith('reconcile', { operationId: f.operation.id })
        } finally {
            await f.cleanup()
        }
    })
    it('turns revoked grants and deadlines into cancellation, preserving timeout semantics', async () => {
        const f = fixture()
        try {
            const gateway = await f.gateway(),
                socket = f.socket()
            f.grant.enabled = false
            await gateway.handleConnection(socket as unknown as Socket)
            expect(socket.emit).toHaveBeenCalledWith(
                'command',
                expect.objectContaining({ type: 'cancel', reason: 'cancelled' })
            )
            f.operation.deadline = new Date(0)
            await f.publish()
            expect(socket.emit).toHaveBeenCalledWith(
                'command',
                expect.objectContaining({ type: 'cancel', reason: 'timed_out' })
            )
        } finally {
            await f.cleanup()
        }
    })
    it('rejects wrong-version handshakes and oversized output frames', async () => {
        const f = fixture()
        try {
            const gateway = await f.gateway(),
                bad = f.socket()
            bad.handshake.auth.version = 2
            await gateway.handleConnection(bad as unknown as Socket)
            expect(bad.disconnect).toHaveBeenCalledWith(true)
            const socket = f.socket()
            await gateway.handleConnection(socket as unknown as Socket)
            await gateway.report(
                {
                    version: 1,
                    operationId: f.operation.id,
                    connectionEpoch: f.device.connectionEpoch,
                    type: 'output',
                    state: 'running',
                    seq: 1,
                    stream: 'stdout',
                    data: 'a'.repeat(65536)
                },
                socket as unknown as Socket
            )
            expect(f.operations.receive).not.toHaveBeenCalled()
            expect(socket.disconnect).toHaveBeenCalledWith(true)
        } finally {
            await f.cleanup()
        }
    })
})
