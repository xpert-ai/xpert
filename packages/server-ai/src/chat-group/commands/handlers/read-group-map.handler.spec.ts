import { randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { ChatConversation } from '../../../chat-conversation/conversation.entity'
import { ChatMessage } from '../../../chat-message/chat-message.entity'
import { GroupParticipant } from '../../group.entity'
import { GroupAccessService } from '../../group-access.service'
import { groupMapPageSchema, groupMapQuerySchema } from '../../group-map.schema'
import { ReadGroupMapCommand } from '../read-group-map.command'
import { ReadGroupMapHandler } from './read-group-map.handler'

function fixture() {
    const ids = {
        group: randomUUID(),
        runtime: randomUUID(),
        sender: randomUUID(),
        second: randomUUID(),
        root: randomUUID(),
        progress: randomUUID(),
        final: randomUUID()
    }
    const context: XpertResolvedViewHostContext = {
        hostType: 'agent',
        hostId: 'assistant',
        userId: 'user',
        tenantId: 'tenant',
        organizationId: 'org',
        slots: [],
        runtimeScope: {
            conversationId: ids.runtime,
            projectId: null,
            dataScopeKey: 'assistant',
            workspaceFiles: { catalog: 'xperts', scopeId: 'assistant' }
        }
    }
    const runtime = {
        id: ids.runtime,
        xpertId: 'assistant',
        threadId: 'private-thread',
        projectId: null,
        purpose: 'group_assistant_runtime'
    }
    const group = {
        id: ids.group,
        xpertId: 'assistant',
        threadId: 'public-thread',
        title: 'Meeting',
        revision: 3,
        tenantId: 'tenant',
        organizationId: 'org'
    }
    const members = [ids.sender, ids.second].map((id) => ({
        id,
        subjectId: id,
        groupId: ids.group,
        name: id,
        kind: 'assistant',
        active: true,
        runtimeConversationId: 'secret'
    }))
    const communication = {
        intent: 'request',
        senderId: ids.sender,
        recipientIds: [ids.second],
        rootMessageId: ids.root,
        rootUserId: randomUUID(),
        hop: 0
    }
    const root = {
        id: ids.root,
        sequence: 1,
        content: 'Question',
        createdAt: new Date(),
        groupCommunication: communication
    }
    const progress = {
        ...root,
        id: ids.progress,
        sequence: 2,
        content: 'Partial answer',
        groupCommunication: {
            ...communication,
            senderId: ids.second,
            intent: 'reply',
            replyStage: 'progress',
            replyToMessageId: ids.root
        }
    }
    const final = {
        ...progress,
        id: ids.final,
        sequence: 3,
        content: 'Final answer',
        groupCommunication: { ...progress.groupCommunication, replyStage: 'final' }
    }
    const builder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([final, progress, root])
    }
    const conversations = { findOneBy: jest.fn().mockResolvedValue(runtime) }
    const participants = {
        findOneBy: jest.fn().mockResolvedValue(members[0]),
        find: jest.fn().mockResolvedValue(members)
    }
    const messages = {
        createQueryBuilder: jest.fn().mockReturnValue(builder),
        find: jest.fn().mockResolvedValue([root, progress, final])
    }
    const db = Object.assign(Object.create(DataSource.prototype), {
        getRepository: jest.fn((entity) =>
            entity === ChatConversation
                ? conversations
                : entity === GroupParticipant
                  ? participants
                  : entity === ChatMessage
                    ? messages
                    : { find: jest.fn().mockResolvedValue([]) }
        )
    })
    const access = Object.assign(Object.create(GroupAccessService.prototype), {
        authorize: jest.fn().mockResolvedValue({ group })
    })
    jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
    jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
    jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
    const handler = new ReadGroupMapHandler(db, access)
    return {
        ids,
        context,
        runtime,
        group,
        conversations,
        participants,
        messages,
        builder,
        access,
        handler,
        read: (query = {}) => handler.execute(new ReadGroupMapCommand(context, groupMapQuerySchema.parse(query)))
    }
}
afterEach(() => jest.restoreAllMocks())
it('projects public replies from all speakers, preserving progress/final and causal links without runtime IDs', async () => {
    const f = fixture(),
        page = groupMapPageSchema.parse(await f.read())
    expect(page.messages.map((message) => [message.senderId, message.replyStage, message.parentId])).toEqual([
        [f.ids.sender, undefined, null],
        [f.ids.second, 'progress', f.ids.root],
        [f.ids.second, 'final', f.ids.root]
    ])
    expect(f.access.authorize).toHaveBeenCalledWith(f.ids.group)
    expect(JSON.stringify(page)).not.toMatch(/secret|private-thread|runtimeConversationId|rootUserId/)
    expect(f.builder.where).toHaveBeenCalledWith({
        tenantId: 'tenant',
        organizationId: 'org',
        conversationId: f.ids.group
    })
})
it('paginates by public sequence and applies sender/search filters before the limit', async () => {
    const f = fixture(),
        page = await f.read({ before: 9, participantId: f.ids.second, search: '10%', limit: 2 })
    expect(page?.nextBefore).toBe(2)
    expect(page?.messages.map((message) => message.sequence)).toEqual([2, 3])
    expect(f.builder.andWhere).toHaveBeenCalledWith('message.sequence < :before', { before: 9 })
    expect(f.builder.andWhere).toHaveBeenCalledWith(expect.stringContaining('senderId'), { sender: f.ids.second })
    expect(f.builder.andWhere).toHaveBeenCalledWith(expect.stringContaining('ILIKE'), { search: '%10\\%%' })
    expect(f.builder.take).toHaveBeenCalledWith(3)
})
it('omits parent references that do not resolve inside this public group', async () => {
    const f = fixture()
    f.messages.find.mockResolvedValue([])
    expect((await f.read())?.messages.every((message) => message.parentId === null)).toBe(true)
})
it('returns null for ordinary conversations so the existing map keeps its own policy', async () => {
    const f = fixture()
    f.runtime.purpose = 'private'
    expect(await f.read()).toBeNull()
    expect(f.access.authorize).not.toHaveBeenCalled()
})
it.each(['actor', 'assistant', 'project', 'removed', 'membership', 'public'])(
    'rejects invalid group scope: %s',
    async (failure) => {
        const f = fixture()
        if (failure === 'actor') f.context.userId = 'another-user'
        if (failure === 'assistant') f.runtime.xpertId = 'another-assistant'
        if (failure === 'project') f.context.runtimeScope!.projectId = randomUUID()
        if (failure === 'removed') f.participants.findOneBy.mockResolvedValue(null)
        if (failure === 'membership') f.access.authorize.mockRejectedValue(Error('removed member'))
        if (failure === 'public') f.runtime.purpose = 'group'
        await expect(f.read()).rejects.toThrow()
        expect(f.builder.getMany).not.toHaveBeenCalled()
    }
)
it('rejects a member selector from another group', async () => {
    const f = fixture()
    await expect(f.read({ participantId: randomUUID() })).rejects.toThrow()
    expect(f.builder.getMany).not.toHaveBeenCalled()
})
