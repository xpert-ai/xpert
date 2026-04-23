jest.mock('@xpert-ai/server-core', () => ({
	CrudController: class CrudController {
		constructor() {}
	},
	TransformInterceptor: class TransformInterceptor {},
	UUIDValidationPipe: class UUIDValidationPipe {}
}))

import { ProjectTaskController } from './project-task.controller'

describe('ProjectTaskController', () => {
	let controller: ProjectTaskController
	let service: {
		moveTasks: jest.Mock
		reorderInLane: jest.Mock
	}

	beforeEach(() => {
		service = {
			moveTasks: jest.fn(),
			reorderInLane: jest.fn()
		}

		controller = new ProjectTaskController(service as never)
	})

	it('forwards move payloads to the project task service', async () => {
		service.moveTasks.mockResolvedValue([{ id: 'task-1' }])

		const result = await controller.moveTasks({
			taskIds: ['task-1'],
			targetSwimlaneId: 'lane-1'
		})

		expect(service.moveTasks).toHaveBeenCalledWith(['task-1'], 'lane-1')
		expect(result).toEqual([{ id: 'task-1' }])
	})

	it('forwards reorder payloads to the project task service', async () => {
		service.reorderInLane.mockResolvedValue([{ id: 'task-2' }, { id: 'task-1' }])

		const result = await controller.reorderInLane('lane-1', {
			orderedTaskIds: ['task-2', 'task-1']
		})

		expect(service.reorderInLane).toHaveBeenCalledWith('lane-1', ['task-2', 'task-1'])
		expect(result).toEqual([{ id: 'task-2' }, { id: 'task-1' }])
	})
})
