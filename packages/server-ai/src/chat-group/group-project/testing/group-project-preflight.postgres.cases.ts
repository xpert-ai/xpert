import { randomUUID } from 'node:crypto'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import type { XpertProjectTypeRef } from '@xpert-ai/contracts'
import { DataSource } from 'typeorm'
import { ChatConversation } from '../../../chat-conversation/conversation.entity'
import { ChatMessage } from '../../../chat-message/chat-message.entity'
import { XpertAgentExecution } from '../../../xpert-agent-execution/agent-execution.entity'
import { GroupMessagesService } from '../../group-messages.service'
import { GroupMessageRecipient, GroupParticipant } from '../../group.entity'
import { GroupProjectService } from '../group-project.service'

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
}
