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
        tasks.resolveExecution.mockRejectedValue(Error('access_denied'))
        await expect(
            provider.executeViewAction(agent, 'timeline', 'execution-target', { input: { taskExecutionId } })
        ).rejects.toThrow('access_denied')
    })
})
