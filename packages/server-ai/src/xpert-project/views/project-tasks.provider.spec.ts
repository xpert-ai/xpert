import { Test } from '@nestjs/testing'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { ProjectTasksViewProvider } from './project-tasks.provider'
import { ProjectTaskGraphService } from '../services/project-task-graph.service'
import { ProjectTaskRuntimeReadService } from '../runtime/project-task-runtime-read.service'
import { ProjectTaskDecisionService } from '../runtime/project-task-decision.service'

const project: XpertResolvedViewHostContext = {
    slots: [],
    hostType: 'project',
    hostId: 'p',
    tenantId: 't',
    organizationId: 'o',
    userId: 'u'
}
const agent: XpertResolvedViewHostContext = {
    ...project,
    hostType: 'agent',
    hostId: 'assistant',
    runtimeScope: {
        projectId: 'p',
        conversationId: 'c',
        dataScopeKey: 'scope',
        workspaceFiles: { catalog: 'projects', scopeId: 'p', projectId: 'p' }
    }
}
async function fixture() {
    const tasks = {
        graph: jest.fn().mockResolvedValue({ tasks: [] }),
        resolveExecution: jest.fn().mockResolvedValue({
            projectId: 'p',
            conversationId: 'c',
            threadId: 'thread',
            agentExecutionId: 'execution',
            xpertId: 'assistant'
        })
    }
    const module = await Test.createTestingModule({
        providers: [
            ProjectTasksViewProvider,
            { provide: ProjectTaskGraphService, useValue: tasks },
            { provide: ProjectTaskRuntimeReadService, useValue: {} },
            { provide: ProjectTaskDecisionService, useValue: {} }
        ]
    }).compile()
    return { provider: module.get(ProjectTasksViewProvider), tasks }
}
describe('shared project task View', () => {
    it('advertises an on-demand Agent view behind its feature and current project', async () => {
        const { provider } = await fixture()
        expect(provider.getViewManifests(agent, 'agent.workbench.fixed')[0]).toMatchObject({
            icon: { type: 'svg', value: expect.stringContaining('<svg') },
            workbench: { openMode: 'on-demand' },
            activation: { requiredFeatures: ['project.tasks'] }
        })
        expect(provider.getViewManifests({ ...agent, runtimeScope: undefined }, 'agent.workbench.fixed')).toEqual([])
        expect(provider.getViewManifests(project, 'task.management')[0].workbench).toBeUndefined()
    })
    it('uses the runtime project rather than the Assistant id or UI-supplied identifiers', async () => {
        const { provider, tasks } = await fixture()
        await provider.getViewData(agent)
        expect(tasks.graph).toHaveBeenCalledWith({
            projectId: 'p',
            actor: { tenantId: 't', organizationId: 'o', userId: 'u' }
        })
    })
    it('resolves the exact execution through the scoped service before navigation', async () => {
        const { provider, tasks } = await fixture()
        const taskExecutionId = '99999999-9999-4999-8999-999999999999'
        const result = await provider.executeViewAction(agent, 'timeline', 'execution-target', {
            input: { taskExecutionId }
        })
        expect(tasks.resolveExecution.mock.calls[0][0].projectId).toBe('p')
        expect(result.data).toMatchObject({ target: 'assistant.execution', executionId: 'execution' })
        const conversation = await provider.executeViewAction(agent, 'timeline', 'execution-target', {
            input: { taskExecutionId, destination: 'conversation' }
        })
        expect(conversation.data).toMatchObject({
            target: 'assistant.conversation',
            conversationId: 'c',
            threadId: 'thread'
        })
        tasks.resolveExecution.mockRejectedValue(Error('access_denied'))
        await expect(
            provider.executeViewAction(agent, 'timeline', 'execution-target', { input: { taskExecutionId } })
        ).rejects.toThrow('access_denied')
    })
    it('opens a view in the existing Agent Workbench without navigating its chat, with a generic fallback', async () => {
        const { provider, tasks } = await fixture()
        const taskExecutionId = '99999999-9999-4999-8999-999999999999'
        for (const coding of [true, false]) {
            tasks.resolveExecution.mockResolvedValue({
                projectId: 'p',
                invocationId: 'invocation',
                ...(coding ? { codingInvocationId: 'invocation' } : {})
            })
            const result = await provider.executeViewAction(agent, 'timeline', 'execution-target', {
                input: { taskExecutionId }
            })
            expect(result.data).toMatchObject({
                target: 'workbench.view',
                projectId: 'p',
                selectionId: 'invocation',
                viewKey: coding ? 'platform.coding-execution__execution' : 'platform.agent-results__results'
            })
            const projectResult = await provider.executeViewAction(project, 'timeline', 'execution-target', {
                input: { taskExecutionId }
            })
            expect(projectResult.data).toMatchObject({
                target: 'assistant.project',
                projectId: 'p',
                selectionId: 'invocation'
            })
        }
    })
})
