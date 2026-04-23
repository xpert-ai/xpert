import {
  IProjectSprint,
  ProjectSprintStatusEnum
} from '../../../../../../packages/contracts/src/project/project-sprint.model'
import {
  ProjectAgentRole,
  ProjectExecutionEnvironmentType,
  ProjectSwimlaneKindEnum,
  ProjectSprintStrategyEnum
} from '../../../../../../packages/contracts/src/project/project-strategy.model'
import type { IProjectSwimlane } from '../../../../../../packages/contracts/src/project/project-swimlane.model'
import { ProjectTaskStatusEnum, type IProjectTask } from '../../../../../../packages/contracts/src/project/project-task.model'
import { buildProjectBoardColumns, formatProjectLabel, pickDefaultSprint } from './project-page.utils'

describe('project page utils', () => {
  it('selects running sprint before review and latest planned sprint', () => {
    const sprints: IProjectSprint[] = [
      {
        id: 'planned',
        projectId: 'project-1',
        goal: 'Planned sprint',
        status: ProjectSprintStatusEnum.Planned,
        strategyType: ProjectSprintStrategyEnum.SoftwareDelivery,
        updatedAt: new Date('2026-04-18T08:00:00.000Z')
      },
      {
        id: 'review',
        projectId: 'project-1',
        goal: 'Review sprint',
        status: ProjectSprintStatusEnum.Review,
        strategyType: ProjectSprintStrategyEnum.SoftwareDelivery,
        updatedAt: new Date('2026-04-18T09:00:00.000Z')
      },
      {
        id: 'running',
        projectId: 'project-1',
        goal: 'Running sprint',
        status: ProjectSprintStatusEnum.Running,
        strategyType: ProjectSprintStrategyEnum.SoftwareDelivery,
        updatedAt: new Date('2026-04-18T07:00:00.000Z')
      }
    ]

    expect(pickDefaultSprint(sprints)?.id).toBe('running')
  })

  it('sorts swimlanes by sortOrder and groups tasks by lane', () => {
    const swimlanes: IProjectSwimlane[] = [
      {
        id: 'lane-2',
        projectId: 'project-1',
        sprintId: 'sprint-1',
        key: 'review',
        name: 'Review',
        kind: ProjectSwimlaneKindEnum.Execution,
        priority: 1,
        weight: 1,
        concurrencyLimit: 1,
        wipLimit: 1,
        agentRole: ProjectAgentRole.Reviewer,
        environmentType: ProjectExecutionEnvironmentType.Container,
        sortOrder: 2,
        sourceStrategyType: ProjectSprintStrategyEnum.SoftwareDelivery
      },
      {
        id: 'lane-1',
        projectId: 'project-1',
        sprintId: 'sprint-1',
        key: 'coding',
        name: 'Coding',
        kind: ProjectSwimlaneKindEnum.Execution,
        priority: 2,
        weight: 2,
        concurrencyLimit: 2,
        wipLimit: 2,
        agentRole: ProjectAgentRole.Coder,
        environmentType: ProjectExecutionEnvironmentType.Container,
        sortOrder: 1,
        sourceStrategyType: ProjectSprintStrategyEnum.SoftwareDelivery
      }
    ]
    const tasks: IProjectTask[] = [
      {
        id: 'task-1',
        projectId: 'project-1',
        sprintId: 'sprint-1',
        swimlaneId: 'lane-2',
        title: 'Review API',
        sortOrder: 1,
        status: ProjectTaskStatusEnum.Todo,
        dependencies: [],
        updatedAt: new Date('2026-04-18T08:00:00.000Z')
      },
      {
        id: 'task-2',
        projectId: 'project-1',
        sprintId: 'sprint-1',
        swimlaneId: 'lane-1',
        title: 'Build board',
        sortOrder: 0,
        status: ProjectTaskStatusEnum.Doing,
        dependencies: [],
        updatedAt: new Date('2026-04-18T09:00:00.000Z')
      }
    ]

    const columns = buildProjectBoardColumns(swimlanes, tasks)

    expect(columns.map((column) => column.lane.id)).toEqual(['lane-1', 'lane-2'])
    expect(columns[0].tasks.map((task) => task.id)).toEqual(['task-2'])
    expect(columns[1].tasks.map((task) => task.id)).toEqual(['task-1'])
  })

  it('formats strategy and status labels for display', () => {
    expect(formatProjectLabel('software_delivery')).toBe('Software Delivery')
    expect(formatProjectLabel('in-progress')).toBe('In Progress')
  })
})
