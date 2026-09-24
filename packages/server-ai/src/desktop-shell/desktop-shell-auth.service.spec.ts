import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { DesktopShellAuthService } from './desktop-shell-auth.service'
import { DesktopShellDevice, DesktopShellGrant, DesktopShellOperation } from './desktop-shell.entities'
import type { Repository } from 'typeorm'
import type { QueryBus } from '@nestjs/cqrs'
import type { ChatConversationThread } from '../chat-conversation/conversation-thread.entity'

jest.mock('@xpert-ai/server-core', () => ({ TenantOrganizationBaseEntity: class {} }))
jest.mock('@xpert-ai/plugin-sdk', () => ({ RequestContext: {} }))
jest.mock('i18next', () => ({ t: (_key: string, opts: { defaultValue: string }) => opts.defaultValue }))

const scope = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID() }
function fixture() {
    const device = { id: randomUUID(), ...scope, enabled: true, credentialExpiresAt: new Date(Date.now() + 10000) }
    const grant = {
        id: randomUUID(),
        ...scope,
        deviceId: device.id,
        assistantId: randomUUID(),
        threadId: randomUUID(),
        enabled: true,
        expiresAt: new Date(Date.now() + 10000)
    }
    const devices = {
        findOneBy: jest.fn(async (where: object) =>
            Object.entries(where).every(([k, v]) => Reflect.get(device, k) === v) ? device : null
        ),
        update: jest.fn()
    }
    const grants = {
        findOneBy: jest.fn(async (where: object) =>
            Object.entries(where).every(([k, v]) => Reflect.get(grant, k) === v) ? grant : null
        ),
        update: jest.fn()
    }
    const operations = { update: jest.fn() }
    const service = new DesktopShellAuthService(
        devices as unknown as Repository<DesktopShellDevice>,
        grants as unknown as Repository<DesktopShellGrant>,
        operations as unknown as Repository<DesktopShellOperation>,
        {} as Repository<ChatConversationThread>,
        {} as QueryBus
    )
    return { service, device, grant, devices, grants, operations }
}

describe('Desktop Shell authorization', () => {
    it('uses only identity fields when passed the richer runtime scope', async () => {
        const f = fixture()
        const runScope = {
            ...scope,
            runId: randomUUID(),
            toolCallId: 'call',
            grantId: f.grant.id,
            threadId: f.grant.threadId
        }
        await expect(f.service.requireGrant(f.grant.id, f.grant.threadId, runScope)).resolves.toEqual({
            grant: f.grant,
            device: f.device
        })
        expect(f.grants.findOneBy.mock.calls[0][0]).not.toHaveProperty('runId')
    })
    it.each(['userId', 'tenantId', 'organizationId'])('rejects crossing %s', async (key) => {
        const f = fixture()
        await expect(
            f.service.requireGrant(f.grant.id, f.grant.threadId, { ...scope, [key]: randomUUID() })
        ).rejects.toMatchObject({ status: 403 })
    })
    it('rejects a grant from a different thread or assistant', async () => {
        const f = fixture()
        await expect(f.service.requireGrant(f.grant.id, randomUUID(), scope)).rejects.toMatchObject({ status: 403 })
        await expect(f.service.requireGrant(f.grant.id, f.grant.threadId, scope, randomUUID())).rejects.toMatchObject({
            status: 403
        })
    })
    it('rejects expired grants and disabled devices', async () => {
        const f = fixture()
        f.grant.expiresAt = new Date(0)
        await expect(f.service.requireGrant(f.grant.id, f.grant.threadId, scope)).rejects.toMatchObject({ status: 403 })
        f.grant.expiresAt = new Date(Date.now() + 10000)
        f.device.enabled = false
        await expect(f.service.requireGrant(f.grant.id, f.grant.threadId, scope)).rejects.toMatchObject({ status: 403 })
    })
    it('revocation cancels active operations but cannot revoke another owner grant', async () => {
        const f = fixture()
        await f.service.revokeGrant(f.grant.id, scope)
        expect(f.grants.update).toHaveBeenCalledWith(f.grant.id, { enabled: false })
        expect(f.operations.update).toHaveBeenCalledWith(expect.objectContaining({ grantId: f.grant.id, ...scope }), {
            state: 'cancel_requested'
        })
        await expect(f.service.revokeGrant(f.grant.id, { ...scope, userId: randomUUID() })).rejects.toMatchObject({
            status: 404
        })
    })
    it('never accepts malformed connection credentials', async () => {
        const f = fixture()
        for (const token of [null, {}, 'not-a-token', `${randomUUID()}.secret`])
            await expect(f.service.authenticate(token)).rejects.toMatchObject({ status: 401 })
    })
})
