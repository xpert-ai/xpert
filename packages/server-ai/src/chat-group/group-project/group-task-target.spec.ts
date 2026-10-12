import { randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'
import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { GroupParticipant } from '../group.entity'
import { GroupAccessService } from '../group-access.service'
import { XpertProjectAccessService } from '../../xpert-project/services/project-access.service'
import { GroupTaskTargetService } from './group-task-target.service'

function fixture() {
    const scope = {
        tenantId: randomUUID(),
        organizationId: randomUUID(),
        userId: randomUUID(),
        projectId: randomUUID(),
        conversationId: randomUUID(),
        parentExecutionId: randomUUID(),
        callerXpertId: randomUUID(),
        callerAgentKey: 'general_agent'
    }
    const group = Object.assign(new ChatConversation(), { id: randomUUID(), projectId: scope.projectId })
    const source = Object.assign(new GroupParticipant(), {
        id: randomUUID(),
        groupId: group.id,
        subjectId: scope.callerXpertId,
        runtimeConversationId: scope.conversationId
    })
    const member = Object.assign(new GroupParticipant(), {
        id: randomUUID(),
        groupId: group.id,
        subjectId: randomUUID(),
        runtimeConversationId: randomUUID(),
        name: 'Worker'
    })
    const db = new DataSource({ type: 'postgres' })
    const members = jest
        .spyOn(db.getRepository(GroupParticipant), 'findOneBy')
        .mockImplementation(async (where) =>
            'runtimeConversationId' in where ? source : 'id' in where && where.id === member.id ? member : null
        )
    const conversations = jest.spyOn(db.getRepository(ChatConversation), 'findOneBy').mockResolvedValue(group)
    const access = {
        withRootUser: jest.fn(async (_group, _user, task: () => Promise<unknown>) => task()),
        authorize: jest.fn(),
        assistant: jest.fn().mockResolvedValue({ id: member.subjectId, version: '1', updatedAt: new Date(0) })
    }
    const projects = { assertCanEdit: jest.fn(), assertCanUseXpert: jest.fn() }
    const service = new GroupTaskTargetService(
        db,
        access as unknown as GroupAccessService,
        projects as unknown as XpertProjectAccessService
    )
    return { scope, group, source, member, members, conversations, access, projects, service }
}
describe('group Project task target authorization', () => {
    afterEach(() => jest.restoreAllMocks())
    it('revalidates the shared caller runtime independently of any dispatch target', async () => {
        const f = fixture()
        await f.service.authorizeCaller(f.scope)
        expect(f.access.authorize).toHaveBeenCalledWith(f.group.id)
        expect(f.projects.assertCanUseXpert).toHaveBeenCalledWith(f.scope.projectId, f.source.subjectId)
        f.projects.assertCanUseXpert.mockRejectedValueOnce(new Error('binding revoked'))
        await expect(f.service.authorizeCaller(f.scope)).rejects.toThrow('binding revoked')
        f.access.authorize.mockRejectedValueOnce(new Error('membership revoked'))
        await expect(f.service.authorizeCaller(f.scope)).rejects.toThrow('membership revoked')
    })
    it('derives the group and executor from the captured caller and checks both Project bindings', async () => {
        const f = fixture()
        const target = await f.service.resolve(f.scope, f.member.id)
        expect(target).toMatchObject({
            provider: 'xpert-task',
            bindingId: f.member.id,
            reference: f.member.subjectId,
            configuration: {
                executionContext: { type: 'group_member', groupId: f.group.id, sourceParticipantId: f.source.id }
            }
        })
        expect(f.access.withRootUser).toHaveBeenCalledWith(f.group, f.scope.userId, expect.any(Function))
        expect(f.projects.assertCanEdit).toHaveBeenCalledWith(f.scope.projectId)
        expect(f.projects.assertCanUseXpert).toHaveBeenCalledWith(f.scope.projectId, f.source.subjectId)
        expect(f.projects.assertCanUseXpert).toHaveBeenCalledWith(f.scope.projectId, f.member.subjectId)
    })
    it('rejects foreign members, self-dispatch and revoked access', async () => {
        const f = fixture()
        await expect(f.service.resolve(f.scope, randomUUID())).rejects.toThrow()
        await expect(f.service.resolve(f.scope, f.source.id)).rejects.toThrow()
        f.projects.assertCanUseXpert.mockRejectedValueOnce(new Error('binding revoked'))
        await expect(f.service.resolve(f.scope, f.member.id)).rejects.toThrow('binding revoked')
        f.access.authorize.mockRejectedValueOnce(new Error('membership revoked'))
        await expect(f.service.resolve(f.scope, f.member.id)).rejects.toThrow('membership revoked')
    })
    it('fails closed after a runtime Project changes', async () => {
        const f = fixture()
        f.conversations.mockImplementation(async (where) => ('id' in where && where.id === f.group.id ? f.group : null))
        await expect(f.service.resolve(f.scope, f.member.id)).rejects.toThrow()
    })
})
