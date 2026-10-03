import { EntityManager, Repository } from 'typeorm'
import { XpertProject } from '../entities/project.entity'
import { ChatMessage } from '../../chat-message/chat-message.entity'
import { ProjectResourceCardService } from './project-resource-card.service'
import type { ConversationResourceCard, IChatConversation, IChatMessage } from '@xpert-ai/contracts'

const card: ConversationResourceCard = {
    resource: { namespace: 'platform', type: 'project', id: 'project' },
    title: 'Bid',
    open: { target: 'assistant.project', projectId: 'project', viewKey: 'platform.project-tasks__timeline' }
}
const conversation = {
    id: 'conversation',
    projectId: 'project',
    tenantId: 'tenant',
    organizationId: 'org'
} as IChatConversation
const reply = {
    id: 'reply',
    conversationId: conversation.id,
    role: 'ai',
    content: '',
    executionId: 'run'
} as IChatMessage

function fixture() {
    const bootstrap = { conversationId: conversation.id, initialName: 'Bid', resourceCards: [card] }
    const project: XpertProject = Object.assign(new XpertProject(), {
        id: 'project',
        settings: { conversationBootstrap: bootstrap }
    })
    const message = Object.assign(new ChatMessage(), reply)
    const findOne = jest.fn(async () => project),
        updateProject = jest.fn(async (_id: string, changes: Pick<XpertProject, 'settings'>) => {
            project.settings = changes.settings
        })
    const findMessage = jest.fn(async () => message),
        updateMessage = jest.fn(async (_id: string, changes: Pick<ChatMessage, 'content'>) => {
            Object.assign(message, changes)
        })
    const manager = Object.assign(new EntityManager(undefined), {
        getRepository: jest.fn((entity) =>
            entity === XpertProject
                ? { findOne, update: updateProject }
                : { findOneOrFail: findMessage, update: updateMessage }
        )
    })
    // Serialize callers like the database row lock and roll both writes back on failure.
    let tail = Promise.resolve()
    const transaction = jest.fn(<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> => {
        const run = tail.then(async () => {
            const oldSettings = structuredClone(project.settings),
                oldContent = structuredClone(message.content)
            try {
                return await work(manager)
            } catch (error) {
                project.settings = oldSettings
                message.content = oldContent
                throw error
            }
        })
        tail = run.then(
            () => undefined,
            () => undefined
        )
        return run
    })
    const repository = new Repository<XpertProject>(XpertProject, Object.assign(manager, { transaction }))
    return {
        service: new ProjectResourceCardService(repository),
        project,
        message,
        findOne,
        findMessage,
        updateProject,
        updateMessage
    }
}

describe('Project resource card delivery', () => {
    it('persists the card and claims its reply together, then does not duplicate it', async () => {
        const f = fixture()
        const result = await f.service.attach(conversation, reply)
        expect(result.content).toEqual([
            expect.objectContaining({ type: 'resource_card', messageId: 'reply', executionId: 'run', data: card })
        ])
        expect(f.project.settings.conversationBootstrap.resourceCardMessageId).toBe('reply')
        await f.service.attach(conversation, { ...reply, id: 'second' })
        expect(f.updateMessage).toHaveBeenCalledTimes(1)
        expect(f.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'project', tenantId: 'tenant', organizationId: 'org' },
                lock: { mode: 'pessimistic_write' }
            })
        )
    })
    it('serializes simultaneous first replies and emits only one creation receipt', async () => {
        const f = fixture()
        const results = await Promise.all([
            f.service.attach(conversation, reply),
            f.service.attach(conversation, { ...reply, id: 'second' })
        ])
        expect(results.filter((value) => Array.isArray(value.content))).toHaveLength(1)
        expect(f.updateMessage).toHaveBeenCalledTimes(1)
    })
    it('recovers a pending receipt after the atomic attachment fails', async () => {
        const f = fixture()
        f.updateProject.mockRejectedValueOnce(Error('database unavailable'))
        await expect(f.service.attach(conversation, reply)).rejects.toThrow('database unavailable')
        expect(f.project.settings.conversationBootstrap.resourceCardMessageId).toBeUndefined()
        expect(f.message.content).toBe('')
        expect((await f.service.attach(conversation, reply)).content).toHaveLength(1)
    })
    it('does not emit for an unrelated conversation or a manual project', async () => {
        const f = fixture()
        f.project.settings.conversationBootstrap.conversationId = 'other'
        expect(await f.service.attach(conversation, reply)).toBe(reply)
        f.project.settings = {}
        expect(await f.service.attach(conversation, reply)).toBe(reply)
        expect(f.updateMessage).not.toHaveBeenCalled()
    })
})
