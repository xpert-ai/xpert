jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { randomUUID } from 'node:crypto'
import { IXpertProjectTask } from '@xpert-ai/contracts'
import { XpertProjectTaskService } from '../../../services/project-task.service'
import { createCreateTasksTool } from './create'
import { createUpdateTasksTool } from './update'

function fixture() {
    const service = Object.assign(Object.create(XpertProjectTaskService.prototype) as XpertProjectTaskService, {
        createTask: jest.fn(async (projectId: string, input: Partial<IXpertProjectTask>) => ({
            ...input,
            id: randomUUID(),
            projectId,
            revision: 1
        })),
        updateTaskSteps: jest.fn(async () => []),
        createExecution: jest.fn()
    })
    const assertPermission = jest.fn()
    return { service, assertPermission, projectId: randomUUID() }
}

it.each([undefined, randomUUID()])(
    'preserves omitted/explicit planning responsibility: %s',
    async (assigneeXpertId) => {
        const f = fixture()
        await createCreateTasksTool(f).invoke({
            tasks: [{ name: 'Planning', requirements: ['Verified result'], steps: [], assigneeXpertId }]
        })
        expect(f.service.createTask).toHaveBeenCalledWith(f.projectId, expect.objectContaining({ assigneeXpertId }))
        expect(f.service.createExecution).not.toHaveBeenCalled()
        expect(f.assertPermission).toHaveBeenCalledTimes(1)
    }
)

it('allows assignment without fabricated steps and rejects provider names as Assistant IDs', async () => {
    const f = fixture(),
        id = randomUUID(),
        assigneeXpertId = randomUUID()
    const update = createUpdateTasksTool(f)
    await update.invoke({ tasks: [{ id, assigneeXpertId }] })
    expect(f.service.updateTaskSteps).toHaveBeenCalledWith(f.projectId, undefined, { id, assigneeXpertId })
    expect(f.service.createExecution).not.toHaveBeenCalled()
    await expect(update.invoke({ tasks: [{ id, assigneeXpertId: 'codex-computer' }] })).rejects.toThrow()
    await expect(update.invoke({ tasks: [{ id, steps: [{ status: 'done' }] }] })).rejects.toThrow()
    expect(f.service.updateTaskSteps).toHaveBeenCalledTimes(1)
    f.assertPermission.mockRejectedValueOnce(new Error('Denied'))
    await expect(update.invoke({ tasks: [{ id, assigneeXpertId }] })).rejects.toThrow('Denied')
    expect(f.service.updateTaskSteps).toHaveBeenCalledTimes(1)
})
