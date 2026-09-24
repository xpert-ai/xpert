// Invariants: device credentials cannot authenticate general API calls; grants bind once to an owned thread.
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, In, IsNull } from 'typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { QueryBus } from '@nestjs/cqrs'
import type { ShellScope } from '@xpert-ai/contracts'
import { LIMITS, isId, parseSettings } from '@xpert-ai/desktop-protocol'
import { DesktopShellDevice, DesktopShellGrant, DesktopShellOperation } from './desktop-shell.entities'
import { parseShellBoundary, shellError } from './desktop-shell.errors'
import { ChatConversationThread } from '../chat-conversation/conversation-thread.entity'
import { AssertChatConversationAccessQuery } from '../chat-conversation/queries/conversation-assert-access.query'

export function currentShellScope(): ShellScope {
    const tenantId = RequestContext.currentTenantId()
    const organizationId = RequestContext.getOrganizationId()
    const userId = RequestContext.currentUserId()
    if (!isId(tenantId) || !isId(organizationId) || !isId(userId)) shellError('GRANT_REVOKED', 403)
    return { tenantId, organizationId, userId }
}
const scopeFields = (scope: ShellScope): ShellScope => ({
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    userId: scope.userId
})
const hash = (token: string) => createHash('sha256').update(token).digest('hex')

@Injectable()
export class DesktopShellAuthService {
    constructor(
        @InjectRepository(DesktopShellDevice) readonly devices: Repository<DesktopShellDevice>,
        @InjectRepository(DesktopShellGrant) readonly grants: Repository<DesktopShellGrant>,
        @InjectRepository(DesktopShellOperation) readonly operations: Repository<DesktopShellOperation>,
        @InjectRepository(ChatConversationThread) readonly threads: Repository<ChatConversationThread>,
        private readonly queryBus: QueryBus
    ) {}

    async register(body: unknown) {
        if (
            !body ||
            typeof body !== 'object' ||
            !('installationId' in body) ||
            !isId(body.installationId) ||
            !('platform' in body) ||
            body.platform !== 'darwin' ||
            !('settings' in body)
        )
            shellError('INVALID_MESSAGE')
        const settings = parseShellBoundary(parseSettings, body.settings)
        const scope = currentShellScope()
        const existing = await this.devices.findOneBy({ ...scopeFields(scope), installationId: body.installationId })
        if (existing) await this.disable(existing.id, scope)
        const secret = randomBytes(32).toString('base64url')
        const id = existing?.id ?? randomUUID()
        const expiresAt = new Date(Date.now() + LIMITS.grant)
        await this.devices.save({
            ...(existing ?? {}),
            id,
            ...scopeFields(scope),
            installationId: body.installationId,
            platform: 'darwin',
            name: settings.name,
            shell: settings.shell,
            cwd: settings.cwd,
            enabled: true,
            credentialHash: hash(secret),
            credentialExpiresAt: expiresAt,
            connectionEpoch: null,
            leaseExpiresAt: null
        })
        return { deviceId: id, token: `${id}.${secret}`, expiresAt: expiresAt.getTime() }
    }

    async refresh(deviceId: string) {
        const device = await this.requireDevice(deviceId, currentShellScope())
        const secret = randomBytes(32).toString('base64url')
        const expiresAt = new Date(Date.now() + LIMITS.grant)
        await this.devices.update(device.id, { credentialHash: hash(secret), credentialExpiresAt: expiresAt })
        return { token: `${device.id}.${secret}`, expiresAt: expiresAt.getTime() }
    }

    async authenticate(token: unknown): Promise<DesktopShellDevice> {
        if (typeof token !== 'string' || token.length > 150) shellError('GRANT_REVOKED', 401)
        const [id, secret] = token.split('.')
        if (!isId(id) || !secret) shellError('GRANT_REVOKED', 401)
        const device = await this.devices.findOneBy({ id, enabled: true })
        if (
            !device ||
            device.credentialExpiresAt.getTime() <= Date.now() ||
            !timingSafeEqual(Buffer.from(hash(secret)), Buffer.from(device.credentialHash))
        )
            shellError('GRANT_REVOKED', 401)
        return device
    }

    async requireDevice(id: string, scope: ShellScope) {
        if (!isId(id)) shellError('INVALID_MESSAGE')
        const device = await this.devices.findOneBy({ id, ...scopeFields(scope), enabled: true })
        if (!device) shellError('GRANT_REVOKED', 403)
        return device
    }

    async issueGrant(deviceId: string, assistantId: unknown, threadId: unknown) {
        if (!isId(assistantId) || (threadId !== null && threadId !== undefined && !isId(threadId)))
            shellError('INVALID_MESSAGE')
        const scope = currentShellScope()
        const device = await this.requireDevice(deviceId, scope)
        if (typeof threadId === 'string') {
            const thread = await this.threads.findOneBy({ threadId, tenantId: scope.tenantId })
            if (!thread) shellError('NOT_FOUND', 404)
            await this.queryBus.execute(
                new AssertChatConversationAccessQuery({ id: thread.conversationId }, 'contribute')
            )
        }
        const grant = await this.grants.save({
            ...scopeFields(scope),
            deviceId: device.id,
            assistantId,
            threadId: typeof threadId === 'string' ? threadId : null,
            enabled: true,
            expiresAt: new Date(Math.min(device.credentialExpiresAt.getTime(), Date.now() + LIMITS.grant))
        })
        return { id: grant.id, expiresAt: grant.expiresAt.getTime(), threadId: grant.threadId }
    }

    async bindForRun(grantId: unknown, threadId: string, assistantId: string, scope = currentShellScope()) {
        if (!isId(grantId) || !isId(threadId)) shellError('GRANT_REVOKED', 403)
        await this.grants.update(
            { id: grantId, ...scopeFields(scope), assistantId, enabled: true, threadId: IsNull() },
            { threadId }
        )
        return this.requireGrant(grantId, threadId, scope, assistantId)
    }

    async requireGrant(id: string, threadId: string, scope: ShellScope, assistantId?: string) {
        const grant = await this.grants.findOneBy({
            id,
            ...scopeFields(scope),
            threadId,
            enabled: true,
            ...(assistantId ? { assistantId } : {})
        })
        if (!grant || grant.expiresAt.getTime() <= Date.now()) shellError('GRANT_REVOKED', 403)
        const device = await this.requireDevice(grant.deviceId, scope)
        return { grant, device }
    }

    async revokeGrant(id: string, scope = currentShellScope()) {
        if (!isId(id)) shellError('INVALID_MESSAGE')
        const grant = await this.grants.findOneBy({ id, ...scopeFields(scope) })
        if (!grant) shellError('NOT_FOUND', 404)
        await this.grants.update(grant.id, { enabled: false })
        await this.operations.update(
            { grantId: id, ...scopeFields(scope), state: In(['pending', 'running']) },
            { state: 'cancel_requested' }
        )
        return { revoked: true }
    }

    async disable(id: string, scope = currentShellScope()) {
        if (!isId(id)) shellError('INVALID_MESSAGE')
        const device = await this.devices.findOneBy({ id, ...scopeFields(scope) })
        if (!device) shellError('NOT_FOUND', 404)
        await this.devices.update(device.id, { enabled: false })
        await this.grants.update({ deviceId: id, ...scopeFields(scope) }, { enabled: false })
        await this.operations.update(
            { deviceId: id, ...scopeFields(scope), state: In(['pending', 'running']) },
            { state: 'cancel_requested' }
        )
        return { enabled: false }
    }
}
