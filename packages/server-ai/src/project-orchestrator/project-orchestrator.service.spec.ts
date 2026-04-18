import { ProjectSwimlaneKindEnum, ProjectTaskStatusEnum } from '@xpert-ai/contracts'
import { buildSprintExecutionSnapshot } from './project-orchestrator.service'
import { ProjectSprint } from '../project-sprint/project-sprint.entity'
import { ProjectSwimlane } from '../project-swimlane/project-swimlane.entity'
import { ProjectTask } from '../project-task/project-task.entity'

describe('buildSprintExecutionSnapshot', () => {
	it('filters blocked tasks and applies lane concurrency and wip limits', () => {
		const sprint = {
			id: 'sprint-1'
		} as ProjectSprint
		const swimlanes = [
			{
				id: 'lane-high',
				kind: ProjectSwimlaneKindEnum.Execution,
				priority: 2,
				weight: 2,
				sortOrder: 1,
				concurrencyLimit: 2,
				wipLimit: 2
			},
			{
				id: 'lane-low',
				kind: ProjectSwimlaneKindEnum.Execution,
				priority: 1,
				weight: 1,
				sortOrder: 2,
				concurrencyLimit: 1,
				wipLimit: 1
			},
			{
				id: 'lane-backlog',
				kind: ProjectSwimlaneKindEnum.Backlog,
				priority: 100,
				weight: 100,
				sortOrder: 0,
				concurrencyLimit: 0,
				wipLimit: 0
			}
		] as ProjectSwimlane[]
		const tasks = [
			{
				id: 'task-dependency',
				swimlaneId: 'lane-high',
				status: ProjectTaskStatusEnum.Done,
				dependencies: [],
				sortOrder: 0,
				createdAt: new Date('2024-01-01T00:00:00.000Z')
			},
			{
				id: 'task-running',
				swimlaneId: 'lane-high',
				status: ProjectTaskStatusEnum.Doing,
				dependencies: [],
				sortOrder: 1,
				createdAt: new Date('2024-01-01T00:01:00.000Z')
			},
			{
				id: 'task-ready',
				swimlaneId: 'lane-high',
				status: ProjectTaskStatusEnum.Todo,
				dependencies: ['task-dependency'],
				sortOrder: 2,
				createdAt: new Date('2024-01-01T00:02:00.000Z')
			},
			{
				id: 'task-waiting-for-slot',
				swimlaneId: 'lane-high',
				status: ProjectTaskStatusEnum.Todo,
				dependencies: [],
				sortOrder: 3,
				createdAt: new Date('2024-01-01T00:03:00.000Z')
			},
			{
				id: 'task-blocked',
				swimlaneId: 'lane-high',
				status: ProjectTaskStatusEnum.Todo,
				dependencies: ['task-missing'],
				sortOrder: 4,
				createdAt: new Date('2024-01-01T00:04:00.000Z')
			},
			{
				id: 'task-low-lane',
				swimlaneId: 'lane-low',
				status: ProjectTaskStatusEnum.Todo,
				dependencies: [],
				sortOrder: 0,
				createdAt: new Date('2024-01-01T00:05:00.000Z')
			},
			{
				id: 'task-backlog',
				swimlaneId: 'lane-backlog',
				status: ProjectTaskStatusEnum.Todo,
				dependencies: [],
				sortOrder: 0,
				createdAt: new Date('2024-01-01T00:05:00.000Z')
			}
		] as ProjectTask[]

		const snapshot = buildSprintExecutionSnapshot(sprint, swimlanes, tasks)

		expect(snapshot.runnableTasks.map(({ task }) => task.id)).toEqual(['task-ready', 'task-low-lane'])
		expect(snapshot.runnableTasks.map(({ task }) => task.id)).not.toContain('task-backlog')
		expect(snapshot.blockedTaskIds).toEqual(expect.arrayContaining(['task-waiting-for-slot', 'task-blocked']))
		expect(snapshot.lanes[0]).toEqual(
			expect.objectContaining({
				availableSlots: 1,
				runnableTaskIds: ['task-ready']
			})
		)
	})
})
