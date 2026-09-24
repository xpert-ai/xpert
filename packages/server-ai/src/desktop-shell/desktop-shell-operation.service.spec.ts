import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import type { RedisClientType } from 'redis'
import type { ShellReport } from '@xpert-ai/contracts'
import { LIMITS } from '@xpert-ai/desktop-protocol'
import { DesktopShellAuthService } from './desktop-shell-auth.service'
import { DesktopShellOperationService } from './desktop-shell-operation.service'
import { DesktopShellDevice, DesktopShellOperation } from './desktop-shell.entities'

jest.mock('@xpert-ai/server-core', () => ({ TenantOrganizationBaseEntity: class {}, REDIS_CLIENT: 'REDIS_CLIENT' }))
jest.mock('@xpert-ai/plugin-sdk', () => ({ RequestContext: {} }))
jest.mock('i18next', () => ({ t: (_key: string, opts: { defaultValue: string }) => opts.defaultValue }))

function fixture() {
    const scope = {
        tenantId: randomUUID(),
        organizationId: randomUUID(),
        userId: randomUUID(),
        threadId: randomUUID(),
        runId: randomUUID(),
        toolCallId: 'call_1',
        grantId: randomUUID()
    }
    const device = {
        id: randomUUID(),
        enabled: true,
        cwd: '/tmp',
        name: 'Test',
        platform: 'darwin',
        shell: '/bin/zsh',
        leaseExpiresAt: new Date(Date.now() + 90000)
    }
    let stored: DesktopShellOperation | null = null
    const devices = { findOne: jest.fn(async () => device), findOneBy: jest.fn(async () => device) }
    const operations = {
        findOne: jest.fn(async (query: { where: { id: string; deviceId: string } }) =>
            stored?.id === query.where.id && stored?.deviceId === query.where.deviceId ? stored : null
        ),
        findOneBy: jest.fn(async () => stored),
        countBy: jest.fn(async () => 0),
        save: jest.fn(async (record: Partial<DesktopShellOperation>) => {
            stored = Object.assign(new DesktopShellOperation(), { id: randomUUID() }, record)
            return stored
        })
    }
    const manager = { getRepository: (entity: object) => (entity === DesktopShellDevice ? devices : operations) }
    const transaction = async <T>(work: (manager: object) => Promise<T>) => work(manager)
    const auth = {
        devices: { ...devices, manager: { transaction } },
        operations: { ...operations, manager: { transaction } },
        requireGrant: jest.fn(async () => ({ device, grant: { id: scope.grantId } }))
    }
    const redis = { publish: jest.fn(async () => 0) }
    const service = new DesktopShellOperationService(
        auth as unknown as DesktopShellAuthService,
        redis as unknown as RedisClientType
    )
    const report = (operationId: string, update: object) =>
        ({
            version: 1,
            operationId,
            connectionEpoch: randomUUID(),
            type: 'output',
            seq: 1,
            stream: 'stdout',
            data: 'hello',
            ...update
        }) as ShellReport
    return { scope, device, service, operations, auth, report }
}

describe('Desktop Shell operation delivery', () => {
    it('reuses the durable operation on retry and rejects changed arguments', async () => {
        const f = fixture()
        const first = await f.service.execute({ action: 'exec', command: 'echo once' }, f.scope)
        const retry = await f.service.execute({ action: 'exec', command: 'echo once' }, f.scope)
        expect(retry.id).toBe(first.id)
        expect(f.operations.save).toHaveBeenCalledTimes(1)
        await expect(f.service.execute({ action: 'exec', command: 'echo twice' }, f.scope)).rejects.toMatchObject({
            status: 409
        })
    })
    it('fails closed for offline or busy devices without creating queued work', async () => {
        const f = fixture()
        f.device.leaseExpiresAt = new Date(0)
        await expect(f.service.execute({ action: 'exec', command: 'pwd' }, f.scope)).rejects.toMatchObject({
            status: 409
        })
        f.device.leaseExpiresAt = new Date(Date.now() + 90000)
        f.operations.countBy.mockResolvedValue(1)
        await expect(f.service.execute({ action: 'exec', command: 'pwd' }, f.scope)).rejects.toMatchObject({
            status: 409
        })
        expect(f.operations.save).not.toHaveBeenCalled()
    })
    it('reconciles missing chunks and ignores replay duplicates and late terminal changes', async () => {
        const f = fixture(),
            op = await f.service.execute({ action: 'exec', command: 'pwd' }, f.scope)
        expect(await f.service.receive(f.device.id, f.report(op.id, { seq: 2 }))).toBe(false)
        expect(await f.service.receive(randomUUID(), f.report(op.id, {}))).toBe(false)
        expect(await f.service.receive(f.device.id, f.report(op.id, {}))).toBe(true)
        expect(await f.service.receive(f.device.id, f.report(op.id, {}))).toBe(true)
        await f.service.receive(
            f.device.id,
            f.report(op.id, { type: 'state', seq: 2, state: 'succeeded', exitCode: 0, truncated: false })
        )
        await f.service.receive(
            f.device.id,
            f.report(op.id, { type: 'state', seq: 3, state: 'running', exitCode: null, truncated: false })
        )
        const result = await f.service.result(await f.service.requireOperation(op.id, f.scope))
        expect(result).toMatchObject({ state: 'succeeded', stdout: 'hello', exitCode: 0, nextCursor: 1 })
        expect((await f.service.result(await f.service.requireOperation(op.id, f.scope), 1)).stdout).toBe('')
    })
    it('returns bounded incremental output with a resumable cursor', async () => {
        const f = fixture(),
            op = await f.service.execute({ action: 'exec', command: 'pwd' }, f.scope)
        for (let seq = 1; seq <= 10; seq++)
            await f.service.receive(f.device.id, f.report(op.id, { seq, data: 'a'.repeat(8192) }))
        const current = await f.service.requireOperation(op.id, f.scope)
        const first = await f.service.result(current)
        expect(Buffer.byteLength(first.stdout)).toBe(LIMITS.result)
        const rest = await f.service.result(current, first.nextCursor)
        expect(Buffer.byteLength(rest.stdout)).toBe(16384)
        expect(rest.nextCursor).toBe(10)
    })
})
