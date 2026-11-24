jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { XpertProjectTaskService } from '../../../services/project-task.service'
import { createListTasksTool } from './list'

it('distinguishes an ordinary summary from a provider-managed stage in task discovery', async () => {
    const items = [
        {
            id: 'stage',
            kind: 'task',
            type: 'pipeline.work',
            controlKind: 'pipeline',
            providerKey: 'coding_project',
            pipelineInstanceId: 'pipeline',
            executions: []
        },
        { id: 'summary', kind: 'summary', controlKind: 'ordinary', executions: [] }
    ]
    const service = Object.assign(Object.create(XpertProjectTaskService.prototype) as XpertProjectTaskService, {
        findAll: jest.fn().mockResolvedValue({ items }),
        observeExecutions: jest.fn().mockResolvedValue([])
    })
    const assertPermission = jest.fn()
    const result = await createListTasksTool({ projectId: 'project', service, assertPermission }).invoke({})
    expect(result).toEqual([
        expect.objectContaining({
            id: 'stage',
            kind: 'task',
            controlKind: 'pipeline',
            providerKey: 'coding_project',
            pipelineInstanceId: 'pipeline'
        }),
        expect.objectContaining({ id: 'summary', kind: 'summary', controlKind: 'ordinary' })
    ])
    expect(assertPermission).toHaveBeenCalledTimes(1)
})
