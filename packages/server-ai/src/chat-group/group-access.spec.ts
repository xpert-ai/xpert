import { ChatMessage } from '../chat-message/chat-message.entity'
import { withGroupRuntime } from './group-runtime-context'
import { ApiKeyBindingType, SecretTokenBindingType } from '@xpert-ai/contracts'
import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { randomUUID } from 'node:crypto'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { GroupAccessService } from './group-access.service'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { User, UserOrganization } from '@xpert-ai/server-core'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { GroupParticipant, GroupMessageRecipient } from './group.entity'

describe('group authorization boundary', () => {
    const groupId = randomUUID(),
        tenantId = randomUUID(),
        organizationId = randomUUID(),
        userId = randomUUID()
    const actor = { id: randomUUID(), groupId, subjectId: userId, active: true, role: 'member' }
    const group = { id: groupId, tenantId, organizationId, purpose: 'group' }
    const people = { findOne: jest.fn(), findOneBy: jest.fn() }
    const groups = { findOneBy: jest.fn(), findOneByOrFail: jest.fn() },
        participants = { findOneBy: jest.fn() }
    const receipts = { findOneBy: jest.fn() },
        messageRows = { findOneByOrFail: jest.fn() }
    let access: GroupAccessService
    beforeEach(async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(organizationId)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(userId)
        jest.spyOn(RequestContext, 'currentApiKey').mockReturnValue(undefined)
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(null)
        jest.spyOn(RequestContext, 'currentRequest').mockReturnValue(undefined)
        people.findOne.mockResolvedValue({ id: userId })
        people.findOneBy.mockResolvedValue({ isActive: true })
        groups.findOneBy.mockResolvedValue(group)
        groups.findOneByOrFail.mockResolvedValue(group)
        participants.findOneBy.mockResolvedValue(actor)
        const module = await Test.createTestingModule({
            providers: [
                GroupAccessService,
                { provide: PublishedXpertAccessService, useValue: {} },
                {
                    provide: DataSource,
                    useValue: {
                        getRepository: (entity: unknown) => {
                            if (entity === User || entity === UserOrganization) return people
                            if (entity === ChatConversation) return groups
                            if (entity === GroupParticipant) return participants
                            if (entity === GroupMessageRecipient) return receipts
                            if (entity === ChatMessage) return messageRows
                            throw new Error('Unexpected entity')
                        }
                    }
                }
            ]
        }).compile()
        access = module.get(GroupAccessService)
    })
    afterEach(() => jest.restoreAllMocks())
    it('revalidates persisted delivery and resolves the human sender only inside a bound group runtime', async () => {
        const task = jest.fn().mockResolvedValue('done')
        const root = jest.spyOn(access, 'withRootUser').mockImplementation(async (_group, _user, run) => run())
        receipts.findOneBy.mockResolvedValue({
            id: 'delivery',
            tenantId,
            groupId,
            participantId: actor.id,
            messageId: 'message',
            status: 'starting'
        })
        messageRows.findOneByOrFail.mockResolvedValue({ role: 'human', createdById: userId })
        await expect(access.withDeliveryActor('delivery', tenantId, 'runtime', task)).rejects.toMatchObject({
            status: 403
        })
        expect(root).not.toHaveBeenCalled()
        await expect(
            withGroupRuntime('runtime', () => access.withDeliveryActor('delivery', tenantId, 'runtime', task))
        ).resolves.toBe('done')
        expect(participants.findOneBy).toHaveBeenCalledWith(
            expect.objectContaining({ runtimeConversationId: 'runtime', active: true, kind: 'assistant' })
        )
        expect(root).toHaveBeenCalledWith(group, userId, task)
        receipts.findOneBy.mockResolvedValue(null)
        await expect(
            withGroupRuntime('runtime', () => access.withDeliveryActor('delivery', tenantId, 'runtime', task))
        ).rejects.toMatchObject({ status: 403 })
    })
    it('requires a real organizational human member and does not infer membership from group creation', async () => {
        await expect(access.authorize(groupId)).resolves.toMatchObject({ actor })
        expect(groups.findOneBy).toHaveBeenCalledWith({ id: groupId, tenantId, organizationId, purpose: 'group' })
        participants.findOneBy.mockResolvedValue(null)
        await expect(access.authorize(groupId)).rejects.toMatchObject({ status: 403 })
    })
    it('requires owner role for invitations and active organization membership on every request', async () => {
        await expect(access.authorize(groupId, true)).rejects.toMatchObject({ status: 403 })
        people.findOneBy.mockResolvedValue(null)
        await expect(access.authorize(groupId)).rejects.toMatchObject({ status: 403 })
    })
    it('requires organization scope instead of falling back to another organization', () => {
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(undefined)
        expect(() => access.scope()).toThrow()
    })
    it('binds a shared conversation credential to D, never E, and distinguishes expiry from lost membership', async () => {
        const principal = {
            id: userId,
            tenantId,
            principalType: 'client_secret' as const,
            clientSecretBindingType: SecretTokenBindingType.USER_CONVERSATION,
            requestedOrganizationId: organizationId,
            resourceScope: { kind: 'conversation' as const, conversationId: groupId },
            clientSecretExpiresAt: new Date(Date.now() + 60_000)
        }
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(principal as never)
        await expect(access.authorize(groupId)).resolves.toMatchObject({ actor })
        await expect(access.authorize(randomUUID())).rejects.toMatchObject({ status: 403 })
        participants.findOneBy.mockResolvedValue(null)
        await expect(access.authorize(groupId)).rejects.toMatchObject({ status: 403 })
        principal.clientSecretExpiresAt = new Date(0)
        await expect(access.authorize(groupId)).rejects.toMatchObject({ status: 401 })
    })
    it('rejects an Assistant-scoped credential even when a human user ID is present', async () => {
        jest.spyOn(RequestContext, 'currentApiKey').mockReturnValue({
            token: 'test-only',
            type: ApiKeyBindingType.ASSISTANT,
            entityId: randomUUID()
        })
        await expect(access.authorize(groupId)).rejects.toMatchObject({ status: 403 })
    })
})
