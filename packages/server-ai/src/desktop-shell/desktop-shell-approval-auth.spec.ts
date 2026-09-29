import 'reflect-metadata'
import { randomUUID, createHash } from 'node:crypto'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import type { Repository } from 'typeorm'
import type { QueryBus } from '@nestjs/cqrs'
import { DesktopShellAuthService } from './desktop-shell-auth.service'
import { DesktopShellDevice, DesktopShellGrant, DesktopShellOperation } from './desktop-shell.entities'
import type { ChatConversationThread } from '../chat-conversation/conversation-thread.entity'

jest.mock('@xpert-ai/server-core', () => ({ TenantOrganizationBaseEntity: class {} }))
jest.mock('@xpert-ai/plugin-sdk', () => ({
    RequestContext: { currentTenantId: jest.fn(), getOrganizationId: jest.fn(), currentUserId: jest.fn() }
}))
jest.mock('i18next', () => ({ t: (_key: string, opts: { defaultValue: string }) => opts.defaultValue }))

function fixture() {
    const scope = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID() }
    jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(scope.tenantId)
    jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(scope.organizationId)
    jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(scope.userId)
    const device = Object.assign(new DesktopShellDevice(), {
        id: randomUUID(),
        name: 'Mac',
        cwd: '/tmp',
        enabled: true,
        credentialExpiresAt: new Date(Date.now() + 3600000),
        ...scope
    })
    let grant: DesktopShellGrant | null = null
    const grants = {
        save: jest.fn(async (value: Partial<DesktopShellGrant>) => {
            grant = Object.assign(new DesktopShellGrant(), { id: randomUUID() }, value)
            return grant
        }),
        update: jest.fn(async (_id: string, value: Partial<DesktopShellGrant>) => Object.assign(grant!, value)),
        findOne: jest.fn(async ({ where }: { where: Partial<DesktopShellGrant> }) =>
            grant && Object.entries(where).every(([key, value]) => Reflect.get(grant!, key) === value) ? grant : null
        ),
        manager: {
            transaction: async <T>(run: (manager: object) => Promise<T>) => run({ getRepository: () => grants })
        }
    }
    const devices = { findOneBy: jest.fn(async () => device) }
    const threads = { findOneBy: jest.fn(async () => ({ conversationId: randomUUID() })) }
    const queryBus = { execute: jest.fn(async () => undefined) }
    const service = new DesktopShellAuthService(
        devices as unknown as Repository<DesktopShellDevice>,
        grants as unknown as Repository<DesktopShellGrant>,
        {} as Repository<DesktopShellOperation>,
        threads as unknown as Repository<ChatConversationThread>,
        queryBus as unknown as QueryBus
    )
    const input = {
        kind: 'desktop-shell',
        assistantId: randomUUID(),
        threadId: randomUUID(),
        runId: randomUUID(),
        toolCallId: 'call_1',
        command: 'pwd',
        timeoutSec: 30
    }
    return { service, device, input, queryBus, grants, getGrant: () => grant! }
}
describe('per-operation permission endpoints', () => {
    it('prepares a pending exact command only after checking conversation access', async () => {
        const f = fixture()
        const ready = await f.service.prepareOperation(f.device.id, f.input)
        expect(f.queryBus.execute).toHaveBeenCalledTimes(1)
        expect(ready).toMatchObject({ decision: 'pending', cwd: '/tmp' })
        expect(f.getGrant().operation).toEqual({
            runId: f.input.runId,
            toolCallId: 'call_1',
            decision: 'pending',
            argsHash: createHash('sha256')
                .update(JSON.stringify(['pwd', '/tmp', 30]))
                .digest('hex')
        })
        expect(ready.expiresAt).toBeLessThanOrEqual(Date.now() + 600000)
        await f.service.decideOperation(ready.grantId, 'approve')
        expect(f.getGrant().operation?.decision).toBe('approved')
        await expect(f.service.decideOperation(ready.grantId, 'reject')).rejects.toMatchObject({ status: 409 })
    })
    it('cannot approve another user grant, an expired grant or an edited decision', async () => {
        const f = fixture(),
            ready = await f.service.prepareOperation(f.device.id, f.input)
        const originalUser = f.getGrant().userId
        f.getGrant().userId = randomUUID()
        await expect(f.service.decideOperation(ready.grantId, 'approve')).rejects.toMatchObject({ status: 403 })
        f.getGrant().userId = originalUser
        f.getGrant().expiresAt = new Date(0)
        await expect(f.service.decideOperation(ready.grantId, 'approve')).rejects.toMatchObject({ status: 403 })
        await expect(f.service.decideOperation(ready.grantId, 'edit')).rejects.toMatchObject({ status: 400 })
    })
    it('never creates a permit when conversation access is refused', async () => {
        const f = fixture()
        f.queryBus.execute.mockRejectedValueOnce(new Error('Forbidden'))
        await expect(f.service.prepareOperation(f.device.id, f.input)).rejects.toThrow('Forbidden')
        expect(f.grants.save).not.toHaveBeenCalled()
    })
})
