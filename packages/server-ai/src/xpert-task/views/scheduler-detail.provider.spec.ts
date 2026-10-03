import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ScheduleTaskStatus, TaskFrequency, type XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { SchedulerDetailViewProvider } from './scheduler-detail.provider'
import { XpertTaskService } from '../xpert-task.service'
import { ChatConversation } from '../../chat-conversation/conversation.entity'

const id = '11111111-1111-4111-8111-111111111111'
const runId = '22222222-2222-4222-8222-222222222222'
const context: XpertResolvedViewHostContext = {
    hostType: 'agent',
    hostId: 'assistant',
    slots: [],
    tenantId: 'tenant',
    organizationId: 'org',
    userId: 'user'
}
async function fixture() {
    const task = {
        id,
        xpertId: 'assistant',
        name: 'Morning briefing',
        prompt: 'Summarize',
        timeZone: 'Asia/Shanghai',
        status: ScheduleTaskStatus.SCHEDULED,
        options: { frequency: TaskFrequency.Daily, time: '09:00' },
        scheduleDescription: 'Every day at 09:00'
    }
    const tasks = {
        findHttpAccessibleById: jest.fn().mockResolvedValue(task),
        updateHttpTask: jest.fn(),
        pauseHttpTask: jest.fn(),
        scheduleHttpTask: jest.fn()
    }
    const conversations = {
        findAndCount: jest
            .fn()
            .mockResolvedValue([
                [{ id: runId, title: 'Run', status: 'success', createdAt: new Date('2026-09-29T01:00:00Z') }],
                1
            ]),
        findOneByOrFail: jest.fn().mockResolvedValue({ id: runId, threadId: 'thread' })
    }
    const module = await Test.createTestingModule({
        providers: [
            SchedulerDetailViewProvider,
            { provide: XpertTaskService, useValue: tasks },
            { provide: getRepositoryToken(ChatConversation), useValue: conversations }
        ]
    }).compile()
    return { provider: module.get(SchedulerDetailViewProvider), tasks, conversations, task }
}
describe('Scheduler Workbench detail', () => {
    it('is on demand, feature gated, and accepts task selection', async () => {
        const { provider } = await fixture()
        expect(provider.getViewManifests(context, 'agent.workbench.fixed')[0]).toMatchObject({
            activation: { requiredFeatures: ['scheduler'] },
            workbench: { openMode: 'on-demand' },
            dataSource: { querySchema: { supportsSelection: true } }
        })
        expect(provider.getViewManifests(context, 'other')).toEqual([])
    })
    it('loads compact details and paginated execution history after task authorization', async () => {
        const { provider, tasks, conversations } = await fixture()
        const result = await provider.getViewData(context, 'detail', { selectionId: id, page: 2, pageSize: 10 })
        expect(tasks.findHttpAccessibleById).toHaveBeenCalledWith(id)
        expect(conversations.findAndCount).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { taskId: id, tenantId: 'tenant', organizationId: 'org' },
                skip: 10,
                take: 10
            })
        )
        expect(result.item).toMatchObject({ id, total: 1, page: 2, runs: [{ id: runId }] })
    })
    it('shows the scheduler runtime default timezone when no timezone was saved', async () => {
        const { provider, tasks, task } = await fixture()
        tasks.findHttpAccessibleById.mockResolvedValue({ ...task, timeZone: undefined })
        expect((await provider.getViewData(context, 'detail', { selectionId: id })).item.timeZone).toBe('UTC')
    })

    it('reuses authorized update, pause and resume operations', async () => {
        const { provider, tasks, task } = await fixture()
        await provider.executeViewAction(context, 'detail', 'save', {
            input: { taskId: id, name: task.name, prompt: task.prompt, timeZone: task.timeZone, options: task.options }
        })
        expect(tasks.updateHttpTask).toHaveBeenCalledWith(
            id,
            expect.objectContaining({ name: task.name, options: task.options })
        )
        await provider.executeViewAction(context, 'detail', 'pause', { input: { taskId: id } })
        await provider.executeViewAction(context, 'detail', 'resume', { input: { taskId: id } })
        expect(tasks.pauseHttpTask).toHaveBeenCalledWith(id)
        expect(tasks.scheduleHttpTask).toHaveBeenCalledWith(id)
    })
    it('rejects cross-Assistant resources and propagates access denial', async () => {
        const { provider, tasks } = await fixture()
        await expect(
            provider.getViewData({ ...context, hostId: 'other' }, 'detail', { selectionId: id })
        ).rejects.toThrow()
        tasks.findHttpAccessibleById.mockRejectedValue(Error('access_denied'))
        await expect(provider.executeViewAction(context, 'detail', 'pause', { input: { taskId: id } })).rejects.toThrow(
            'access_denied'
        )
        expect(tasks.pauseHttpTask).not.toHaveBeenCalled()
    })
    it('rejects tasks from a different project before reading execution history or mutating', async () => {
        const { provider, tasks, conversations, task } = await fixture()
        tasks.findHttpAccessibleById.mockResolvedValue({ ...task, projectId: 'other-project' })
        const projectContext: XpertResolvedViewHostContext = {
            ...context,
            runtimeScope: {
                projectId: 'current-project',
                conversationId: null,
                dataScopeKey: 'project:current-project',
                workspaceFiles: { catalog: 'projects', scopeId: 'current-project' }
            }
        }
        await expect(provider.getViewData(projectContext, 'detail', { selectionId: id })).rejects.toThrow()
        await expect(
            provider.executeViewAction(projectContext, 'detail', 'resume', { input: { taskId: id } })
        ).rejects.toThrow()
        expect(conversations.findAndCount).not.toHaveBeenCalled()
        expect(tasks.scheduleHttpTask).not.toHaveBeenCalled()
    })
    it.each([
        { frequency: TaskFrequency.Once, time: '09:00', date: '2026-02-30' },
        { frequency: TaskFrequency.Yearly, time: '09:00', date: '2025-02-29' },
        { frequency: TaskFrequency.Weekly, time: '09:00' },
        { frequency: TaskFrequency.Monthly, time: '09:00' }
    ])('rejects invalid schedule fields before saving: %j', async (options) => {
        const { provider, tasks, task } = await fixture()
        await expect(
            provider.executeViewAction(context, 'detail', 'save', {
                input: { taskId: id, name: task.name, prompt: task.prompt, timeZone: task.timeZone, options }
            })
        ).rejects.toThrow()
        expect(tasks.updateHttpTask).not.toHaveBeenCalled()
    })
    it('rejects an invalid time zone before saving', async () => {
        const { provider, tasks, task } = await fixture()
        await expect(
            provider.executeViewAction(context, 'detail', 'save', {
                input: {
                    taskId: id,
                    name: task.name,
                    prompt: task.prompt,
                    timeZone: 'Invalid/Zone',
                    options: task.options
                }
            })
        ).rejects.toThrow()
        expect(tasks.updateHttpTask).not.toHaveBeenCalled()
    })
    it('opens only execution conversations belonging to the selected task', async () => {
        const { provider, conversations } = await fixture()
        expect(
            await provider.executeViewAction(context, 'detail', 'execution-target', {
                input: { taskId: id, conversationId: runId }
            })
        ).toMatchObject({ success: true, data: { target: 'assistant.conversation', conversationId: runId } })
        expect(conversations.findOneByOrFail).toHaveBeenCalledWith({
            id: runId,
            taskId: id,
            tenantId: 'tenant',
            organizationId: 'org'
        })
    })
})
