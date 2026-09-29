// Invariants: every dispatch rechecks persisted epoch and grant; Redis is only a wake-up hint.
import { randomUUID } from 'node:crypto'
import { Inject, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common'
import {
    ConnectedSocket,
    MessageBody,
    OnGatewayConnection,
    OnGatewayDisconnect,
    SubscribeMessage,
    WebSocketGateway
} from '@nestjs/websockets'
import { Socket } from 'socket.io'
import { In, LessThan } from 'typeorm'
import type { RedisClientType } from 'redis'
import { REDIS_CLIENT } from '@xpert-ai/server-core'
import type { ShellCommand } from '@xpert-ai/contracts'
import { VERSION, NAMESPACE, LIMITS, isId, parseReport } from '@xpert-ai/desktop-protocol'
import { DesktopShellAuthService } from './desktop-shell-auth.service'
import { DesktopShellOperationService, SHELL_DISPATCH_CHANNEL } from './desktop-shell-operation.service'

type Connection = {
    socket: Socket
    deviceId: string
    epoch: string
    dispatching: boolean
    received: Promise<void>
    pendingReports: number
    sent: Map<string, number>
}

@WebSocketGateway({ namespace: NAMESPACE, transports: ['websocket'], maxHttpBufferSize: 65536 })
export class DesktopShellGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(DesktopShellGateway.name)
    private readonly connections = new Map<string, Connection>()
    private subscriber: RedisClientType
    private timer: ReturnType<typeof setInterval>
    constructor(
        private readonly auth: DesktopShellAuthService,
        private readonly operations: DesktopShellOperationService,
        @Inject(REDIS_CLIENT) private readonly redis: RedisClientType
    ) {}

    async onModuleInit() {
        this.subscriber = this.redis.duplicate()
        this.subscriber.on('error', () => this.logger.warn('Desktop Shell notification connection unavailable'))
        await this.subscriber.connect()
        await this.subscriber.subscribe(SHELL_DISPATCH_CHANNEL, (deviceId) => {
            const entry = this.connections.get(deviceId)
            if (entry) void this.dispatch(entry).catch(() => undefined)
        })
        this.timer = setInterval(() => {
            for (const entry of this.connections.values()) void this.dispatch(entry).catch(() => undefined)
            void this.auth.operations
                .update(
                    {
                        state: In(['pending', 'running', 'cancel_requested']),
                        deadline: LessThan(new Date(Date.now() - LIMITS.lease - 10000))
                    },
                    { state: 'unknown', errorCode: 'EXECUTION_UNKNOWN' }
                )
                .catch(() => undefined)
        }, 1000)
        this.timer.unref()
    }

    async handleConnection(socket: Socket) {
        try {
            const credentials = socket.handshake.auth
            if (credentials.version !== VERSION) throw new Error('PROTOCOL_MISMATCH')
            const device = await this.auth.authenticate(credentials.token)
            const epoch = randomUUID()
            const leaseUntil = Date.now() + LIMITS.lease
            await this.auth.devices.update(device.id, { connectionEpoch: epoch, leaseExpiresAt: new Date(leaseUntil) })
            this.connections.get(device.id)?.socket.disconnect(true)
            const entry: Connection = {
                socket,
                deviceId: device.id,
                epoch,
                dispatching: false,
                received: Promise.resolve(),
                pendingReports: 0,
                sent: new Map()
            }
            this.connections.set(device.id, entry)
            socket.emit('ready', { version: VERSION, connectionEpoch: epoch, leaseUntil })
            await this.dispatch(entry)
        } catch {
            socket.emit('revoked', { code: 'GRANT_REVOKED' })
            socket.disconnect(true)
        }
    }

    async handleDisconnect(socket: Socket) {
        const entry = this.find(socket)
        if (!entry) return
        this.connections.delete(entry.deviceId)
        // Preserve the old lease for already running commands; this device cannot receive new work while disconnected.
        await this.auth.devices.update(
            { id: entry.deviceId, connectionEpoch: entry.epoch },
            { leaseExpiresAt: new Date() }
        )
    }

    private find(socket: Socket) {
        return [...this.connections.values()].find((entry) => entry.socket.id === socket.id)
    }

    @SubscribeMessage('heartbeat')
    async heartbeat(@ConnectedSocket() socket: Socket) {
        const entry = this.find(socket)
        if (!entry) return
        const device = await this.auth.devices.findOneBy({ id: entry.deviceId })
        if (
            !device?.enabled ||
            device.connectionEpoch !== entry.epoch ||
            device.credentialExpiresAt.getTime() <= Date.now()
        ) {
            socket.emit('revoked')
            socket.disconnect(true)
            return
        }
        const leaseUntil = Date.now() + LIMITS.lease
        await this.auth.devices.update(
            { id: entry.deviceId, connectionEpoch: entry.epoch },
            { leaseExpiresAt: new Date(leaseUntil) }
        )
        socket.emit('lease', { leaseUntil })
    }

    @SubscribeMessage('report')
    report(@MessageBody() body: unknown, @ConnectedSocket() socket: Socket) {
        const entry = this.find(socket)
        if (!entry) return
        if (++entry.pendingReports > 128) {
            socket.disconnect(true)
            return
        }
        // Serialize messages from this socket so a fast exit cannot overtake its output transaction.
        entry.received = entry.received
            .then(async () => {
                const report = parseReport(body)
                if (report.connectionEpoch !== entry.epoch) return
                const device = await this.auth.devices.findOneBy({ id: entry.deviceId, connectionEpoch: entry.epoch })
                if (!device) return
                const accepted = await this.operations.receive(entry.deviceId, report)
                if (accepted)
                    socket.emit('ack', {
                        operationId: report.operationId,
                        seq: report.seq,
                        type: report.type,
                        state: report.state
                    })
                else socket.emit('reconcile', { operationId: report.operationId })
            })
            .catch(() => {
                socket.disconnect(true)
            })
            .finally(() => {
                entry.pendingReports--
            })
        return entry.received
    }

    @SubscribeMessage('rejected')
    async rejected(@MessageBody() body: unknown, @ConnectedSocket() socket: Socket) {
        const entry = this.find(socket)
        if (
            !entry ||
            !body ||
            typeof body !== 'object' ||
            !('operationId' in body) ||
            !isId(body.operationId) ||
            !('connectionEpoch' in body) ||
            body.connectionEpoch !== entry.epoch ||
            !('code' in body) ||
            typeof body.code !== 'string'
        )
            return
        const device = await this.auth.devices.findOneBy({ id: entry.deviceId, connectionEpoch: entry.epoch })
        if (!device) return
        // Only a never-accepted operation can be rejected. Existing execution may have side effects.
        await this.auth.operations.update(
            { id: body.operationId, deviceId: entry.deviceId, state: 'pending' },
            { state: 'rejected', errorCode: body.code.slice(0, 80) }
        )
    }

    private async dispatch(entry: Connection) {
        if (entry.dispatching) return
        entry.dispatching = true
        try {
            const device = await this.auth.devices.findOneBy({ id: entry.deviceId })
            if (!device || device.connectionEpoch !== entry.epoch) {
                entry.socket.emit('revoked')
                entry.socket.disconnect(true)
                return
            }
            if (!device.enabled || device.credentialExpiresAt.getTime() <= Date.now()) {
                entry.socket.emit('revoked')
                return
            }
            const active = await this.auth.operations.findBy({
                deviceId: device.id,
                state: In(['pending', 'running', 'cancel_requested'])
            })
            const activeIds = new Set(active.map((op) => op.id))
            for (const id of entry.sent.keys()) if (!activeIds.has(id)) entry.sent.delete(id)
            for (const op of active) {
                const grant = await this.auth.grants.findOneBy({ id: op.grantId, enabled: true })
                const cancel =
                    op.state === 'cancel_requested' ||
                    !grant ||
                    grant.expiresAt.getTime() <= Date.now() ||
                    op.deadline.getTime() <= Date.now()
                if (cancel && op.state !== 'cancel_requested') {
                    await this.auth.operations.update(
                        { id: op.id, state: In(['pending', 'running']) },
                        { state: 'cancel_requested' }
                    )
                }
                if (!cancel && op.state !== 'pending') continue
                if ((entry.sent.get(op.id) ?? 0) > Date.now() - 3000 && !cancel) continue
                const message: ShellCommand = cancel
                    ? {
                          type: 'cancel',
                          version: VERSION,
                          operationId: op.id,
                          connectionEpoch: entry.epoch,
                          reason: op.deadline.getTime() <= Date.now() ? 'timed_out' : 'cancelled'
                      }
                    : {
                          type: 'exec',
                          version: VERSION,
                          operationId: op.id,
                          connectionEpoch: entry.epoch,
                          grantId: op.grantId,
                          argsHash: op.argsHash,
                          command: op.command,
                          cwd: op.cwd,
                          timeoutSec: op.timeoutSec,
                          deadline: op.deadline.getTime()
                      }
                entry.socket.emit('command', message)
                entry.sent.set(op.id, Date.now())
            }
        } finally {
            entry.dispatching = false
        }
    }

    async onModuleDestroy() {
        clearInterval(this.timer)
        for (const entry of this.connections.values()) entry.socket.disconnect(true)
        await this.subscriber?.quit()
    }
}
