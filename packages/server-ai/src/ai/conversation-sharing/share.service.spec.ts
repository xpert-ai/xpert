import { Test } from '@nestjs/testing'
import { QueryBus } from '@nestjs/cqrs'
import { DataSource } from 'typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { UserOrganization } from '@xpert-ai/server-core'
import { getConfig } from '@xpert-ai/server-config'
import { SecretTokenBindingType } from '@xpert-ai/contracts'
import { ChatConversationService } from '../../chat-conversation/conversation.service'
import { ChatConversationThreadService } from '../../chat-conversation/conversation-thread.service'
import { ConversationSharingService } from './share.service'
import { shareSnapshot } from './share-projection'
import { ConversationArtifactShares } from './conversation-artifact-shares.service'

jest.mock('@xpert-ai/server-config', () => ({
    ...jest.requireActual('@xpert-ai/server-config'),
    getConfig: jest.fn(jest.requireActual('@xpert-ai/server-config').getConfig)
}))
jest.mock('../../chat-conversation/conversation.service', () => ({ ChatConversationService: class {} }))
jest.mock('../../chat-conversation/conversation-thread.service', () => ({ ChatConversationThreadService: class {} }))

const config = { clientBaseUrl: 'https://app.example' }
const source = {
    id: 'chat',
    tenantId: 'tenant',
    organizationId: 'org',
    createdById: 'owner',
    title: 'Title',
    purpose: 'private'
}
const messages = [
    { id: 'h', role: 'human', content: 'Hello', parentId: null },
    { id: 'a', role: 'ai', content: 'Answer', status: 'success', parentId: 'h' }
]
const token = 'Abc234Def567'
describe('conversation sharing authorization and Artifact delegation', () => {
    let service: ConversationSharingService
    const membership = { findOne: jest.fn() }
    const tree = {
        create: (value: object) => value,
        createAncestorsQueryBuilder: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn()
    }
    const queries = { execute: jest.fn() }
    const conversations = { assertAccess: jest.fn() }
    const threads = { requireByThreadId: jest.fn() }
    const shares = {
        publish: jest.fn(),
        list: jest.fn(),
        revoke: jest.fn(),
        read: jest.fn(),
        listMine: jest.fn(),
        previewMine: jest.fn(),
        revokeMine: jest.fn(),
        revokeAllMine: jest.fn()
    }
    beforeEach(async () => {
        jest.clearAllMocks()
        jest.mocked(getConfig).mockReturnValue(config as ReturnType<typeof getConfig>)
        config.clientBaseUrl = 'https://app.example'
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(null)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('owner')
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
        queries.execute.mockResolvedValue(true)
        conversations.assertAccess.mockResolvedValue({ ...source })
        membership.findOne.mockResolvedValue({ id: 'membership' })
        threads.requireByThreadId.mockResolvedValue({ conversationId: 'chat', headMessageId: 'a' })
        tree.getMany.mockResolvedValue(messages)
        const module = await Test.createTestingModule({
            providers: [
                ConversationSharingService,
                { provide: DataSource, useValue: { getRepository: () => membership, getTreeRepository: () => tree } },
                { provide: QueryBus, useValue: queries },
                { provide: ChatConversationService, useValue: conversations },
                { provide: ChatConversationThreadService, useValue: threads },
                { provide: ConversationArtifactShares, useValue: shares }
            ]
        }).compile()
        service = module.get(ConversationSharingService)
    })
    afterEach(() => jest.restoreAllMocks())
    it('publishes exactly the reviewed snapshot through Artifact storage', async () => {
        const preview = await service.preview('chat', 'thread')
        const input = {
            threadId: 'thread',
            digest: preview.digest,
            audience: 'organization' as const,
            expiresInDays: 7 as const
        }
        await service.create('chat', input)
        expect(shares.publish).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'chat', tenantId: 'tenant', organizationId: 'org', userId: 'owner' }),
            preview.snapshot,
            input
        )
    })
    it('rejects stale previews, cross-conversation branches and inactive owners before publication', async () => {
        await expect(
            service.create('chat', { threadId: 'thread', digest: 'stale', audience: 'organization', expiresInDays: 7 })
        ).rejects.toMatchObject({ status: 409 })
        threads.requireByThreadId.mockResolvedValue({ conversationId: 'other', headMessageId: 'a' })
        await expect(service.preview('chat', 'thread')).rejects.toMatchObject({ status: 400 })
        membership.findOne.mockResolvedValue(null)
        await expect(service.list('chat')).rejects.toMatchObject({ status: 403 })
        expect(shares.publish).not.toHaveBeenCalled()
    })
    it('reopens by reading existing links, and passes only trusted identities to public reads', async () => {
        await service.list('chat')
        expect(shares.list).toHaveBeenCalledWith(expect.objectContaining({ id: 'chat', userId: 'owner' }))
        expect(shares.publish).not.toHaveBeenCalled()
        await service.read(token, false)
        expect(shares.read).toHaveBeenLastCalledWith(token, undefined)
        await service.read(token, true)
        expect(shares.read).toHaveBeenLastCalledWith(token, { userId: 'owner', tenantId: 'tenant' })
    })
    it('scopes personal management to the human owner and tenant, independent of selected organization', async () => {
        membership.findOne.mockResolvedValue(null)
        const before = new Date().toISOString()
        const input = { limit: 20, offset: 0, search: '', before }
        await service.listMine(input)
        expect(shares.listMine).toHaveBeenCalledWith({ userId: 'owner', tenantId: 'tenant' }, input)
        await service.previewMine('share')
        await service.revokeMine('share')
        await service.revokeAllMine({ confirmation: 'revoke-all', before })
        expect(shares.previewMine).toHaveBeenCalledWith({ userId: 'owner', tenantId: 'tenant' }, 'share')
        expect(shares.revokeMine).toHaveBeenCalledWith({ userId: 'owner', tenantId: 'tenant' }, 'share')
        expect(shares.revokeAllMine).toHaveBeenCalledWith({ userId: 'owner', tenantId: 'tenant' }, before)
        expect(conversations.assertAccess).not.toHaveBeenCalled()
    })
    it('allows a user-delegated Assistant session only within its verified Assistant family', async () => {
        conversations.assertAccess.mockResolvedValue({ ...source, xpertId: 'assistant' })
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue({
            principalType: 'client_secret',
            clientSecretBindingType: SecretTokenBindingType.USER_XPERT,
            resourceScope: { kind: 'assistant', xpertId: 'assistant' }
        } as never)
        expect((await service.preview('chat', 'thread')).snapshot.title).toBe('Title')
        expect(queries.execute).toHaveBeenCalled()
        conversations.assertAccess.mockResolvedValue({ ...source, xpertId: 'different-assistant' })
        queries.execute.mockResolvedValue(false)
        await expect(service.preview('chat', 'thread')).rejects.toMatchObject({ status: 403 })
        await expect(service.read(token, true)).rejects.toMatchObject({ status: 403 })
    })

    it.each([
        { createdById: 'another' },
        { projectId: 'project' },
        { purpose: 'group' },
        { tenantId: 'other' },
        { organizationId: 'other' }
    ])('forbids export even if ordinary read/manage access was granted: %j', async (patch) => {
        conversations.assertAccess.mockResolvedValue({ ...source, ...patch })
        await expect(service.preview('chat', 'thread')).rejects.toMatchObject({ status: 403 })
        await expect(service.revoke('chat', 'share')).rejects.toMatchObject({ status: 403 })
    })
    it.each([
        'api_key',
        SecretTokenBindingType.PUBLIC_XPERT,
        SecretTokenBindingType.ENTERPRISE_XPERT,
        SecretTokenBindingType.USER_CONVERSATION
    ])('rejects synthetic or non-user credentials: %s', async (binding) => {
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue({
            principalType: binding === 'api_key' ? 'api_key' : 'client_secret',
            clientSecretBindingType: binding
        } as never)
        await expect(service.preview('chat', 'thread')).rejects.toMatchObject({ status: 403 })
        await expect(service.read(token, true)).rejects.toMatchObject({ status: 403 })
    })
    it('offers public sharing without feature configuration, but still requires explicit confirmation', async () => {
        const preview = await service.preview('chat', 'thread')
        expect(preview.publicSharingEnabled).toBe(true)
        expect(preview.managementUrl).toBe('https://app.example/settings/account/profile?dialog=shared-links')
        const input = {
            threadId: 'thread',
            digest: preview.digest,
            audience: 'public' as const,
            expiresInDays: 1 as const
        }
        await expect(service.create('chat', input)).rejects.toMatchObject({ status: 403 })
        expect(shares.publish).not.toHaveBeenCalled()
        await service.create('chat', { ...input, acknowledgePublic: true })
        expect(shares.publish).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'chat', userId: 'owner' }),
            preview.snapshot,
            { ...input, acknowledgePublic: true }
        )
    })
    it('uses the current shared Cloud URL for management', async () => {
        config.clientBaseUrl = 'https://cloud.example/'
        expect((await service.preview('chat', 'thread')).managementUrl).toBe(
            'https://cloud.example/settings/account/profile?dialog=shared-links'
        )
    })

    it.each([
        'api_key',
        SecretTokenBindingType.USER_XPERT,
        SecretTokenBindingType.PUBLIC_XPERT,
        SecretTokenBindingType.ENTERPRISE_XPERT,
        SecretTokenBindingType.USER_CONVERSATION
    ])('denies personal management to delegated or technical credentials: %s', async (binding) => {
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue({
            principalType: binding === 'api_key' ? 'api_key' : 'client_secret',
            clientSecretBindingType: binding
        } as never)
        await expect(service.listMine({ limit: 20, offset: 0, search: '' })).rejects.toMatchObject({ status: 403 })
        await expect(service.previewMine('share')).rejects.toMatchObject({ status: 403 })
        await expect(service.revokeMine('share')).rejects.toMatchObject({ status: 403 })
        await expect(
            service.revokeAllMine({ confirmation: 'revoke-all', before: new Date().toISOString() })
        ).rejects.toMatchObject({ status: 403 })
        expect(shares.publish).not.toHaveBeenCalled()
    })
})

describe('share projection allowlist', () => {
    it('excludes runtime events, reasoning, tool outputs, images, attachments and queued messages', () => {
        const result = shareSnapshot('Title', [
            ...messages,
            {
                role: 'ai',
                status: 'success',
                content: [
                    { type: 'text', text: 'Visible' },
                    { type: 'image_url', image_url: { url: 'secret-image' } }
                ],
                reasoning: 'secret reasoning',
                events: ['secret tools'],
                attachments: ['secret-file']
            },
            { role: 'ai', status: 'answering', content: 'unfinished' },
            { role: 'human', content: 'queued', followUpStatus: 'pending' },
            {
                role: 'ai',
                status: 'success',
                content: 'runtime',
                messageEnvelope: { version: 1, presentation: 'runtime' }
            },
            {
                role: 'ai',
                status: 'success',
                content: 'unknown',
                messageEnvelope: { version: 99, presentation: 'message' }
            }
        ] as never)
        expect(result.messages.map((m) => m.text)).toEqual(['Hello', 'Answer', 'Visible'])
        expect(JSON.stringify(result)).not.toContain('secret')
    })
    it('fails rather than silently truncating an oversized or empty export', () => {
        expect(() => shareSnapshot('Empty', [])).toThrow()
        expect(() => shareSnapshot('Large', [{ role: 'human', content: 'x'.repeat(1024 * 1024) }])).toThrow()
    })
})
