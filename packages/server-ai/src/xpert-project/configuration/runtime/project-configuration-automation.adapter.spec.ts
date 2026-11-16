import { Test } from '@nestjs/testing'
import { CommandBus } from '@nestjs/cqrs'
import { ProjectConfigurationAutomationAdapter } from './project-configuration-automation.adapter'
import { XpertTaskService } from '../../../xpert-task/xpert-task.service'
import { XpertProjectAccessService } from '../../services/project-access.service'
import { ConnectorService } from '../../../connector/connector.service'
import { TaskFrequency } from '@xpert-ai/contracts'
const taskId = '00000000-0000-4000-8000-000000000001'
const userId = '00000000-0000-4000-8000-000000000002'
async function fixture() {
    const task = { id: taskId, projectId: 'project' }
    const tasks = { findHttpAccessibleById: jest.fn().mockResolvedValue(task), updateHttpTask: jest.fn(),
        proposeProjectTaskRunAs: jest.fn(), acceptProjectTaskRunAs: jest.fn(), pauseHttpTask: jest.fn(), scheduleHttpTask: jest.fn(), deleteHttpTask: jest.fn() }
    const access = { assertCanManage: jest.fn(), assertCanUseXpert: jest.fn() }
    const commands = { execute: jest.fn() }
    const module = await Test.createTestingModule({ providers: [ProjectConfigurationAutomationAdapter,
        { provide: XpertTaskService, useValue: tasks }, { provide: XpertProjectAccessService, useValue: access },
        { provide: ConnectorService, useValue: {} }, { provide: CommandBus, useValue: commands }] }).compile()
    return { service: module.get(ProjectConfigurationAutomationAdapter), task, tasks, access, commands }
}
const taskOperations = [
    (service: ProjectConfigurationAutomationAdapter) => service.pauseAutomation('project', { taskId }),
    (service: ProjectConfigurationAutomationAdapter) => service.resumeAutomation('project', { taskId }),
    (service: ProjectConfigurationAutomationAdapter) => service.deleteAutomation('project', { taskId }),
    (service: ProjectConfigurationAutomationAdapter) => service.proposeAutomationRunAs('project', { taskId, userId }),
    (service: ProjectConfigurationAutomationAdapter) => service.acceptAutomationRunAs('project', { taskId }),
    (service: ProjectConfigurationAutomationAdapter) => service.updateAutomationConnectors('project', { taskId, runtimeState: {} })
]
it.each(taskOperations)('rejects a task outside the current project %#', async (operation) => {
        const { service, task, tasks } = await fixture()
        task.projectId = 'other'
        await expect(operation(service)).rejects.toThrow()
        expect(tasks.findHttpAccessibleById).toHaveBeenCalledWith(taskId)
        expect(tasks.updateHttpTask).not.toHaveBeenCalled()
        expect(tasks.proposeProjectTaskRunAs).not.toHaveBeenCalled()
        expect(tasks.acceptProjectTaskRunAs).not.toHaveBeenCalled()
        expect(tasks.pauseHttpTask).not.toHaveBeenCalled()
        expect(tasks.scheduleHttpTask).not.toHaveBeenCalled()
        expect(tasks.deleteHttpTask).not.toHaveBeenCalled()
    })
it('delegates run-as consent and connector-only updates to the existing task policy', async () => {
    const { service, tasks } = await fixture()
    await service.proposeAutomationRunAs('project', { taskId, userId })
    await service.acceptAutomationRunAs('project', { taskId })
    expect(tasks.proposeProjectTaskRunAs).toHaveBeenCalledWith(taskId, userId)
    expect(tasks.acceptProjectTaskRunAs).toHaveBeenCalledWith(taskId)
    tasks.updateHttpTask.mockRejectedValue(Error('Connector changes only'))
    await expect(service.updateAutomationConnectors('project', { taskId, runtimeState: { unexpected: true } })).rejects.toThrow('Connector changes only')
})
it('enforces manager authority before lifecycle and create/update writes', async () => {
    const { service, tasks, access, commands } = await fixture()
    access.assertCanManage.mockRejectedValue(Error('manager required'))
    await expect(service.pauseAutomation('project', { taskId })).rejects.toThrow('manager required')
    await expect(service.saveAutomation('project', { xpertId: userId, name: 'Schedule', prompt: 'Review',
        options: { frequency: TaskFrequency.Daily, time: '09:00' }, timeZone: 'UTC' })).rejects.toThrow('manager required')
    expect(tasks.pauseHttpTask).not.toHaveBeenCalled()
    expect(commands.execute).not.toHaveBeenCalled()
})

it('keeps scheduling state independent of edits to an existing automation', async () => {
    const { service, tasks } = await fixture()
    await service.saveAutomation('project', { taskId, xpertId: userId, name: 'Updated', prompt: 'Review',
        options: { frequency: TaskFrequency.Daily, time: '09:00' }, timeZone: 'UTC' })
    const [id, changes] = tasks.updateHttpTask.mock.calls[0]
    expect(id).toBe(taskId)
    expect(changes.name).toBe('Updated')
    expect(changes).not.toHaveProperty('status')
})
