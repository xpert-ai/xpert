jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { DataSource } from 'typeorm'
import { randomUUID } from 'node:crypto'
import { User, UserOrganization } from '@xpert-ai/server-core'
import { AgentInvocation, RequestContext } from '@xpert-ai/plugin-sdk'
import { UserType } from '@xpert-ai/contracts'
import { AgentInvocationFactoryService } from '../../agent-invocation/invocation-factory.service'
import { AgentInvocationEntity } from '../../agent-invocation/invocation.entity'
import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { XpertAgentExecution } from '../../xpert-agent-execution/agent-execution.entity'
import { RuntimeMessageAccessService } from './runtime-message-access.service'

function fixture() {
    const scope = {
        tenantId: randomUUID(),
        organizationId: randomUUID(),
        userId: randomUUID(),
        workspaceId: randomUUID(),
        conversationId: randomUUID(),
        parentExecutionId: randomUUID(),
        callerXpertId: randomUUID(),
        callerAgentKey: 'main'
    }
    const invocation: AgentInvocation = {
        id: randomUUID(),
        scope,
        status: 'succeeded',
        revision: 3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        request: {
            target: { bindingId: randomUUID(), provider: 'test', reference: 'test', revision: '1', configuration: {} },
            callId: 'call',
            input: { prompt: 'test' },
            dispatch: {
                version: 1,
                requestId: randomUUID(),
                sourceMessageId: 'message',
                replyTo: {
                    xpertId: scope.callerXpertId,
                    agentKey: scope.callerAgentKey,
                    conversationId: scope.conversationId,
                    threadId: 'thread'
                }
            }
        }
    }
    const record = new AgentInvocationEntity({
        id: invocation.id,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        ownerId: scope.userId,
        invocation
    })
    const conversation = new ChatConversation({
        id: scope.conversationId,
        threadId: 'thread',
        projectId: null,
        createdById: scope.userId
    })
    const parent = new XpertAgentExecution({
        id: scope.parentExecutionId,
        xpertId: scope.callerXpertId,
        threadId: 'thread'
    })
    const users = {
        findOne: jest.fn(async () => new User({ id: scope.userId, tenantId: scope.tenantId, type: UserType.USER }))
    }
    const members = { findOne: jest.fn(async () => new UserOrganization({ userId: scope.userId })) }
    const records = { findOneBy: jest.fn(async () => record) }
    const conversations = { findOneBy: jest.fn(async () => conversation) }
    const parents = { findOneBy: jest.fn(async () => parent) }
    const database = Object.assign(Object.create(DataSource.prototype) as DataSource, {
        getRepository: (entity: unknown) =>
            entity === User
                ? users
                : entity === UserOrganization
                  ? members
                  : entity === AgentInvocationEntity
                    ? records
                    : entity === ChatConversation
                      ? conversations
                      : entity === XpertAgentExecution
                        ? parents
                        : { findOneBy: async () => null }
    })
    const inspect = jest.fn(async () => invocation)
    const resolveGroupTarget = jest.fn()
    const factory = Object.assign(
        Object.create(AgentInvocationFactoryService.prototype) as AgentInvocationFactoryService,
        { createCapturedApi: () => ({ inspect }), resolveGroupTarget }
    )
    return {
        service: new RuntimeMessageAccessService(database, factory),
        record,
        invocation,
        scope,
        parent,
        members,
        users,
        inspect,
        records,
        conversation,
        resolveGroupTarget
    }
}

describe('runtime reply authorization', () => {
    it('reauthorizes a group initiator independently of the runtime conversation creator', async () => {
        const f = fixture()
        f.conversation.createdById = randomUUID()
        await expect(f.service.withReply(f.invocation.id, f.record, async () => undefined)).rejects.toThrow()
        f.conversation.purpose = 'group_assistant_runtime'
        await expect(f.service.withReply(f.invocation.id, f.record, async () => undefined)).rejects.toThrow()
        f.invocation.request.target.provider = 'xpert-task'
        f.invocation.request.target.configuration = {
            executionContext: {
                type: 'group_member',
                groupId: randomUUID(),
                participantId: f.invocation.request.target.bindingId,
                sourceParticipantId: randomUUID(),
                projectId: randomUUID()
            }
        }
        await f.service.withReply(f.invocation.id, f.record, async () => undefined)
        expect(f.resolveGroupTarget).toHaveBeenCalledWith(f.scope, f.invocation.request.target.bindingId)
        f.resolveGroupTarget.mockRejectedValueOnce(new Error('membership revoked'))
        await expect(f.service.withReply(f.invocation.id, f.record, async () => undefined)).rejects.toThrow(
            'membership revoked'
        )
    })
    it('restores the real scoped actor and reloads the authorized invocation', async () => {
        const f = fixture()
        const result = await f.service.withReply(f.invocation.id, f.record, async () => ({
            userId: RequestContext.currentUserId(),
            tenantId: RequestContext.currentTenantId(),
            organizationId: RequestContext.getOrganizationId()
        }))
        expect(result).toEqual({
            userId: f.scope.userId,
            tenantId: f.scope.tenantId,
            organizationId: f.scope.organizationId
        })
        expect(f.records.findOneBy).toHaveBeenCalledWith({
            id: f.invocation.id,
            ownerId: f.scope.userId,
            tenantId: f.scope.tenantId,
            organizationId: f.scope.organizationId
        })
        expect(f.inspect).toHaveBeenCalledWith(f.invocation.id)
    })
    it('rejects membership revocation before inspecting the runtime', async () => {
        const f = fixture()
        f.members.findOne.mockResolvedValue(null)
        await expect(f.service.withReply(f.invocation.id, f.record, async () => undefined)).rejects.toThrow()
        expect(f.inspect).not.toHaveBeenCalled()
    })
    it('rejects a mismatched owner, reply agent or deleted parent', async () => {
        const f = fixture()
        await expect(
            f.service.withReply(f.invocation.id, { ...f.record, ownerId: randomUUID() }, async () => undefined)
        ).rejects.toThrow()
        f.invocation.request.dispatch.replyTo.agentKey = 'another'
        await expect(f.service.withReply(f.invocation.id, f.record, async () => undefined)).rejects.toThrow()
        f.invocation.request.dispatch.replyTo.agentKey = f.scope.callerAgentKey
        Object.assign(f.parent, { xpertId: randomUUID() })
        await expect(f.service.withReply(f.invocation.id, f.record, async () => undefined)).rejects.toThrow()
    })
    it('rejects a reply into an unregistered branch', async () => {
        const f = fixture()
        f.invocation.request.dispatch.replyTo.threadId = 'other-thread'
        await expect(f.service.withReply(f.invocation.id, f.record, async () => undefined)).rejects.toThrow()
    })
})
