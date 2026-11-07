import { randomUUID } from 'node:crypto'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { XpertAgentExecutionStatusEnum, type XpertProjectTypeRef } from '@xpert-ai/contracts'
import { DataSource } from 'typeorm'
import { ChatConversation } from '../../../chat-conversation/conversation.entity'
import { ChatConversationThread } from '../../../chat-conversation/conversation-thread.entity'
import { ChatMessage } from '../../../chat-message/chat-message.entity'
import { XpertAgentExecution } from '../../../xpert-agent-execution/agent-execution.entity'
import { GroupMessagesService } from '../../group-messages.service'
import { GroupMessageRecipient, GroupParticipant } from '../../group.entity'
import { GroupProjectService } from '../group-project.service'
import { assertGroupProjectReuse } from '../group-project-policy'

type Fixture = {
    db: DataSource
    messages: GroupMessagesService
    projects: GroupProjectService
    group: ChatConversation
    c: GroupParticipant
    e: GroupParticipant
    requireProject: () => void
    ensureManagedProject: jest.Mock
    primaryProjectType: (type: XpertProjectTypeRef) => void
}

export function groupProjectPreflightCases(fixture: () => Fixture) {
    it('requires explicit reuse for other groups, including caller-chosen creation IDs, while preserving existing bindings', async () => {
        const f = fixture()
        const projectId = randomUUID()
        await f.db.getRepository(ChatConversation).save({
            tenantId: f.group.tenantId,
            organizationId: f.group.organizationId,
            purpose: 'group',
            projectId,
            title: 'Another group'
        })
        const project = { mode: 'existing' as const, projectId }
        await expect(f.projects.set(f.group.id, { project, participantIds: [f.c.id] })).rejects.toMatchObject({
            status: 409,
            response: { code: 'GROUP_PROJECT_REUSE_REQUIRED' }
        })
        const permission = jest.spyOn(RequestContext, 'hasPermissions').mockReturnValue(true)
        try {
            await expect(
                f.projects.set(f.group.id, {
                    project: { mode: 'create', id: projectId, name: 'Guessed ID' },
                    participantIds: [f.c.id]
                })
            ).rejects.toMatchObject({ status: 409 })
            expect(f.ensureManagedProject).not.toHaveBeenCalled()
        } finally {
            permission.mockRestore()
        }
        expect((await f.db.getRepository(ChatConversation).findOneByOrFail({ id: f.group.id })).projectId).toBeNull()
        await f.projects.set(f.group.id, { project: { ...project, reuse: true }, participantIds: [f.c.id] })
        await f.projects.set(f.group.id, { project, participantIds: [f.c.id, f.e.id] })
        expect(
            (await f.db.getRepository(ChatConversation).findOneByOrFail({ id: f.e.runtimeConversationId })).projectId
        ).toBe(projectId)
    })
    it('serializes concurrent independent claims across groups so only one can bind', async () => {
        const f = fixture()
        const other = await f.db.getRepository(ChatConversation).save({
            tenantId: f.group.tenantId,
            organizationId: f.group.organizationId,
            purpose: 'group',
            title: 'Concurrent group'
        })
        const projectId = randomUUID()
        const claim = (group: ChatConversation) =>
            f.db.transaction(async (manager) => {
                await assertGroupProjectReuse(manager, group, projectId, false)
                await manager.update(ChatConversation, group.id, { projectId })
            })
        const results = await Promise.allSettled([claim(f.group), claim(other)])
        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
        expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
        expect(await f.db.getRepository(ChatConversation).countBy({ purpose: 'group', projectId })).toBe(1)
    })
    it('rejects an existing Project that does not match the primary Assistant type', async () => {
        const f = fixture()
        f.primaryProjectType({ applicationKey: 'test:dashboard', projectTypeKey: 'dashboard' })
        await expect(
            f.projects.set(f.group.id, {
                project: { mode: 'existing', projectId: randomUUID() },
                participantIds: [f.c.id]
            })
        ).rejects.toMatchObject({ status: 400 })
    })
    it('forwards the selected Project type only after creation permission and member validation', async () => {
        const f = fixture()
        const project = {
            mode: 'create' as const,
            id: randomUUID(),
            name: 'October review',
            projectType: { applicationKey: 'test:dashboard', projectTypeKey: 'dashboard' }
        }
        const permission = jest.spyOn(RequestContext, 'hasPermissions').mockReturnValue(false)
        f.primaryProjectType(project.projectType)
        try {
            await expect(f.projects.set(f.group.id, { project, participantIds: [f.c.id] })).rejects.toMatchObject({
                status: 403
            })
            expect(f.ensureManagedProject).not.toHaveBeenCalled()
            permission.mockReturnValue(true)
            await expect(
                f.projects.set(f.group.id, {
                    project: { ...project, projectType: { applicationKey: 'platform', projectTypeKey: 'general' } },
                    participantIds: [f.c.id]
                })
            ).rejects.toMatchObject({ status: 400 })
            expect(f.ensureManagedProject).not.toHaveBeenCalled()
            await f.projects.set(f.group.id, { project, participantIds: [f.c.id, f.e.id] })
            expect(f.ensureManagedProject).toHaveBeenCalledWith({
                projectId: project.id,
                name: project.name,
                xpertId: f.group.xpertId,
                status: 'active',
                projectType: project.projectType
            })
            expect(
                (await f.db.getRepository(ChatConversation).findOneByOrFail({ id: f.c.runtimeConversationId }))
                    .projectId
            ).toBe(project.id)
            const { projectType: _type, ...legacy } = project
            await f.projects.set(f.group.id, { project: legacy, participantIds: [f.c.id] })
            expect(f.ensureManagedProject).toHaveBeenLastCalledWith(
                expect.objectContaining({ projectType: project.projectType })
            )
        } finally {
            permission.mockRestore()
        }
    })
    const request = (recipientIds: string[]) => ({
        intent: 'request' as const,
        recipientIds,
        text: 'Review the monthly figures',
        clientMessageId: randomUUID()
    })
    it('rejects all missing Project recipients before saving any message, receipt or revision', async () => {
        const f = fixture()
        f.requireProject()
        await expect(f.messages.send(f.group.id, request([f.c.id, f.e.id]))).rejects.toMatchObject({
            status: 400,
            response: {
                code: 'GROUP_PROJECT_REQUIRED',
                groupId: f.group.id,
                participantIds: expect.arrayContaining([f.c.id, f.e.id])
            }
        })
        expect(await f.db.getRepository(ChatMessage).count()).toBe(0)
        expect(await f.db.getRepository(GroupMessageRecipient).count()).toBe(0)
        expect(await f.db.getRepository(XpertAgentExecution).count()).toBe(0)
        expect((await f.db.getRepository(ChatConversation).findOneByOrFail({ id: f.group.id })).revision).toBe(0)
    })
    it('reports only unbound recipients and allows the same rejected request after binding', async () => {
        const f = fixture()
        f.requireProject()
        const projectId = randomUUID()
        await f.projects.set(f.group.id, { project: { mode: 'existing', projectId }, participantIds: [f.c.id] })
        const input = request([f.c.id, f.e.id])
        await expect(f.messages.send(f.group.id, input)).rejects.toMatchObject({
            response: { code: 'GROUP_PROJECT_REQUIRED', participantIds: [f.e.id] }
        })
        expect(await f.db.getRepository(ChatMessage).count()).toBe(0)
        await f.projects.set(f.group.id, { project: { mode: 'existing', projectId }, participantIds: [f.c.id, f.e.id] })
        const sent = await f.messages.send(f.group.id, input)
        expect((await f.messages.send(f.group.id, input)).id).toBe(sent.id)
        expect(await f.db.getRepository(ChatMessage).count()).toBe(1)
        expect(await f.db.getRepository(GroupMessageRecipient).count()).toBe(2)
    })
    it('returns an already accepted message on retry even if the Assistant now requires a Project', async () => {
        const f = fixture()
        const input = request([f.c.id])
        const sent = await f.messages.send(f.group.id, input)
        f.requireProject()
        expect((await f.messages.send(f.group.id, input)).id).toBe(sent.id)
        expect(await f.db.getRepository(ChatMessage).count()).toBe(1)
    })

    async function failedFirstAttempt() {
        const f = fixture()
        const message = await f.messages.send(f.group.id, request([f.c.id]))
        const scope = { tenantId: f.group.tenantId, organizationId: f.group.organizationId }
        const execution = await f.db.getRepository(XpertAgentExecution).save({
            ...scope,
            threadId: f.c.runtimeThreadId,
            status: XpertAgentExecutionStatusEnum.ERROR
        })
        const receipt = await f.db.getRepository(GroupMessageRecipient).findOneByOrFail({ messageId: message.id })
        await f.db.getRepository(GroupMessageRecipient).update(receipt.id, {
            status: 'failed',
            phase: 'finalized',
            executionId: execution.id
        })
        await f.db.getRepository(ChatConversationThread).update({ threadId: f.c.runtimeThreadId }, { status: 'error' })
        await f.db.getRepository(ChatConversation).update(f.c.runtimeConversationId, { status: 'error' })
        return { ...f, scope, execution, receipt }
    }
    it('binds an empty, finalized failed runtime while preserving its failed receipt and execution', async () => {
        const f = await failedFirstAttempt()
        const projectId = randomUUID()
        await f.projects.set(f.group.id, { project: { mode: 'existing', projectId }, participantIds: [f.c.id, f.e.id] })
        expect(
            await f.db.getRepository(ChatConversation).findOneByOrFail({ id: f.c.runtimeConversationId })
        ).toMatchObject({ projectId, status: 'error' })
        expect(await f.db.getRepository(GroupMessageRecipient).findOneByOrFail({ id: f.receipt.id })).toMatchObject({
            status: 'failed',
            executionId: f.execution.id
        })
        expect(await f.db.getRepository(XpertAgentExecution).findOneByOrFail({ id: f.execution.id })).toMatchObject({
            status: XpertAgentExecutionStatusEnum.ERROR
        })
        f.requireProject()
        await expect(f.messages.send(f.group.id, request([f.c.id]))).resolves.toMatchObject({
            text: 'Review the monthly figures'
        })
    })
    it.each(['busy', 'message', 'accepted', 'pending', 'lease', 'execution', 'operation', 'bound'])(
        'does not recover a runtime with %s evidence',
        async (evidence) => {
            const f = await failedFirstAttempt()
            if (evidence === 'busy')
                await f.db
                    .getRepository(ChatConversationThread)
                    .update({ threadId: f.c.runtimeThreadId }, { status: 'busy' })
            if (evidence === 'message')
                await f.db
                    .getRepository(ChatMessage)
                    .save({ ...f.scope, conversationId: f.c.runtimeConversationId, role: 'human', content: 'Accepted' })
            if (evidence === 'accepted')
                await f.db.getRepository(GroupMessageRecipient).update(f.receipt.id, { inputMessageId: randomUUID() })
            if (evidence === 'pending')
                await f.db.getRepository(GroupMessageRecipient).update(f.receipt.id, { status: 'pending' })
            if (evidence === 'lease')
                await f.db.getRepository(ChatConversationThread).update(
                    { threadId: f.c.runtimeThreadId },
                    {
                        metadata: {
                            chatkitRunLease: {
                                owner: 'worker',
                                executionId: f.execution.id,
                                expiresAt: new Date(Date.now() + 90_000).toISOString()
                            }
                        }
                    }
                )
            if (evidence === 'execution')
                await f.db
                    .getRepository(XpertAgentExecution)
                    .update(f.execution.id, { status: XpertAgentExecutionStatusEnum.RUNNING })
            if (evidence === 'operation')
                await f.db
                    .getRepository(ChatConversationThread)
                    .update({ threadId: f.c.runtimeThreadId }, { operation: { tasks: [] } })
            if (evidence === 'bound')
                await f.db
                    .getRepository(ChatConversation)
                    .update(f.c.runtimeConversationId, { projectId: randomUUID() })
            await expect(
                f.projects.set(f.group.id, {
                    project: { mode: 'existing', projectId: randomUUID() },
                    participantIds: [f.c.id, f.e.id]
                })
            ).rejects.toMatchObject({ status: 409 })
            expect(
                (await f.db.getRepository(ChatConversation).findOneByOrFail({ id: f.group.id })).projectId
            ).toBeNull()
            expect(
                (await f.db.getRepository(ChatConversation).findOneByOrFail({ id: f.e.runtimeConversationId }))
                    .projectId
            ).toBeNull()
        }
    )
}
