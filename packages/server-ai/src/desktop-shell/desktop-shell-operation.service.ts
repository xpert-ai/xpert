// Invariants: DB state is authoritative; notification delivery never authorizes a second execution.
import { createHash } from 'node:crypto'
import { Injectable, Inject } from '@nestjs/common'
import { In } from 'typeorm'
import { REDIS_CLIENT } from '@xpert-ai/server-core'
import type { RedisClientType } from 'redis'
import type { ShellExecInput, ShellResult, ShellScope, ShellReport } from '@xpert-ai/contracts'
import { LIMITS, isFinal, isId } from '@xpert-ai/desktop-protocol'
import { DesktopShellAuthService } from './desktop-shell-auth.service'
import { DesktopShellDevice, DesktopShellOperation } from './desktop-shell.entities'
import { shellError, shellMessage } from './desktop-shell.errors'

export const SHELL_DISPATCH_CHANNEL = 'xpert:desktop-shell:dispatch'
export interface ShellRunScope extends ShellScope {
    threadId: string
    runId: string
    toolCallId: string
    grantId: string
}

@Injectable()
export class DesktopShellOperationService {
    constructor(
        readonly auth: DesktopShellAuthService,
        @Inject(REDIS_CLIENT) private readonly redis: RedisClientType
    ) {}

    async notify(deviceId: string) {
        // The gateway also polls its connected devices: a lost notification cannot lose a durable operation.
        await this.redis.publish(SHELL_DISPATCH_CHANNEL, deviceId).catch(() => undefined)
    }

    async execute(input: ShellExecInput, scope: ShellRunScope): Promise<DesktopShellOperation> {
        const { grant, device } = await this.auth.requireGrant(scope.grantId, scope.threadId, scope)
        const cwd = input.cwd ?? device.cwd
        if (!cwd.startsWith('/') || !isId(scope.runId) || !scope.toolCallId || scope.toolCallId.length > 255)
            shellError('INVALID_MESSAGE')
        const timeoutSec = input.timeout_sec ?? LIMITS.timeout
        const argsHash = createHash('sha256')
            .update(JSON.stringify([input.command, cwd, timeoutSec]))
            .digest('hex')
        const operation = await this.auth.devices.manager.transaction(async (manager) => {
            const devices = manager.getRepository(DesktopShellDevice)
            const operations = manager.getRepository(DesktopShellOperation)
            const lockedDevice = await devices.findOne({
                where: { id: device.id },
                lock: { mode: 'pessimistic_write' }
            })
            const existing = await operations.findOneBy({
                tenantId: scope.tenantId,
                runId: scope.runId,
                toolCallId: scope.toolCallId
            })
            if (existing) {
                if (existing.argsHash !== argsHash || existing.grantId !== grant.id || existing.userId !== scope.userId)
                    shellError('OPERATION_CONFLICT', 409)
                return existing
            }
            if (
                !lockedDevice?.enabled ||
                !lockedDevice.leaseExpiresAt ||
                lockedDevice.leaseExpiresAt.getTime() <= Date.now()
            )
                shellError('DEVICE_OFFLINE', 409)
            const busy = await operations.countBy({
                deviceId: device.id,
                state: In(['pending', 'running', 'cancel_requested'])
            })
            if (busy) shellError('DEVICE_BUSY', 409)
            return operations.save({
                tenantId: scope.tenantId,
                organizationId: scope.organizationId,
                userId: scope.userId,
                deviceId: device.id,
                grantId: grant.id,
                threadId: scope.threadId,
                runId: scope.runId,
                toolCallId: scope.toolCallId,
                argsHash,
                command: input.command,
                cwd,
                timeoutSec,
                deadline: new Date(Date.now() + timeoutSec * 1000),
                state: 'pending',
                output: [],
                outputBytes: 0,
                seq: 0,
                exitCode: null,
                signal: null,
                truncated: false,
                errorCode: null
            })
        })
        await this.notify(device.id)
        return operation
    }

    async requireOperation(id: string, scope: ShellScope, threadId?: string) {
        if (!isId(id)) shellError('INVALID_MESSAGE')
        const op = await this.auth.operations.findOneBy({
            id,
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            userId: scope.userId,
            ...(threadId ? { threadId } : {})
        })
        if (!op) shellError('NOT_FOUND', 404)
        return op
    }

    async cancel(id: string, scope: ShellScope, threadId?: string) {
        const op = await this.requireOperation(id, scope, threadId)
        await this.auth.operations.update(
            { id: op.id, state: In(['pending', 'running']) },
            { state: 'cancel_requested' }
        )
        await this.notify(op.deviceId)
        return this.result(await this.requireOperation(id, scope, threadId))
    }

    async cancelRuns(runIds: string[]) {
        const active = await this.auth.operations.findBy({
            runId: In(runIds),
            state: In(['pending', 'running', 'cancel_requested'])
        })
        await this.auth.operations.update(
            { runId: In(runIds), state: In(['pending', 'running']) },
            { state: 'cancel_requested' }
        )
        await Promise.all([...new Set(active.map((op) => op.deviceId))].map((id) => this.notify(id)))
    }

    async wait(id: string, scope: ShellScope, signal?: AbortSignal) {
        const end = Date.now() + LIMITS.wait
        let op = await this.requireOperation(id, scope)
        while (!isFinal(op.state) && Date.now() < end) {
            if (signal?.aborted) return this.cancel(id, scope)
            await new Promise((resolve) => setTimeout(resolve, 200))
            op = await this.requireOperation(id, scope)
        }
        return this.result(op)
    }

    async result(op: DesktopShellOperation, cursor = 0): Promise<ShellResult> {
        const device = await this.auth.devices.findOneBy({ id: op.deviceId })
        let stdout = '',
            stderr = '',
            bytes = 0,
            nextCursor = cursor
        for (const chunk of op.output) {
            if (chunk.seq <= cursor) continue
            const size = Buffer.byteLength(chunk.data)
            if (bytes + size > LIMITS.result) break
            bytes += size
            nextCursor = chunk.seq
            if (chunk.stream === 'stdout') stdout += chunk.data
            else stderr += chunk.data
        }
        return {
            operationId: op.id,
            executionTarget: 'desktop',
            device: {
                id: op.deviceId,
                name: device?.name ?? '',
                platform: device?.platform ?? '',
                shell: device?.shell ?? ''
            },
            cwd: op.cwd,
            state: op.state,
            stdout,
            stderr,
            exitCode: op.exitCode,
            ...(op.signal ? { signal: op.signal } : {}),
            nextCursor,
            truncated: op.truncated,
            ...(op.errorCode ? { error: { code: op.errorCode, message: shellMessage(op.errorCode) } } : {})
        }
    }

    async receive(deviceId: string, report: ShellReport) {
        return this.auth.operations.manager.transaction(async (manager) => {
            const repository = manager.getRepository(DesktopShellOperation)
            const op = await repository.findOne({
                where: { id: report.operationId, deviceId },
                lock: { mode: 'pessimistic_write' }
            })
            if (!op) return false
            if (isFinal(op.state)) return true
            if (report.type === 'output') {
                if (report.seq <= op.seq) return true
                if (report.seq !== op.seq + 1) return false
                const bytes = Buffer.byteLength(report.data)
                if (op.outputBytes + bytes > LIMITS.output) {
                    op.truncated = true
                } else {
                    op.output.push({ seq: report.seq, stream: report.stream, data: report.data })
                    op.outputBytes += bytes
                }
                op.seq = report.seq
                if (op.state === 'pending') op.state = 'running'
            } else {
                if (report.seq < op.seq) return true
                // Terminal facts follow all retained chunks. Ask for reconciliation if a chunk was lost.
                if (report.seq > op.seq + 1) return false
                if (op.state === 'cancel_requested' && !isFinal(report.state)) return true
                if (report.state === 'pending') return true
                if (report.state === 'succeeded' && report.exitCode !== 0) shellError('INVALID_MESSAGE')
                op.seq = report.seq
                op.state = report.state
                op.exitCode = report.exitCode
                op.signal = report.signal ?? null
                op.truncated ||= report.truncated
                op.errorCode = report.errorCode ?? null
            }
            await repository.save(op)
            return true
        })
    }
}
