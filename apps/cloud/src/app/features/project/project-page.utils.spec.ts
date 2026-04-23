import {
  IProjectSprint,
  ProjectSprintStatusEnum
} from '../../../../../../packages/contracts/src/project/project-sprint.model'
import { createProjectId, createSprintId } from '../../../../../../packages/contracts/src/project/project-id.type'
import {
  ProjectAgentRole,
  ProjectExecutionEnvironmentType,
  ProjectSystemSwimlaneKeyEnum,
  ProjectSwimlaneKindEnum,
  ProjectSprintStrategyEnum
} from '../../../../../../packages/contracts/src/project/project-strategy.model'
import type { IProjectSwimlane } from '../../../../../../packages/contracts/src/project/project-swimlane.model'
import { ProjectTaskStatusEnum, type IProjectTask } from '../../../../../../packages/contracts/src/project/project-task.model'
import {
  buildProjectBoardColumns,
  formatProjectLabel,
  getBacklogSwimlane,
  pickDefaultSprint,
  pickRequestedSprint
} from './project-page.utils'

describe('project page utils', () => {
  it('selects running sprint before review and latest planned sprint', () => {
    const projectId = createProjectId('project-1')

    const sprints: IProjectSprint[] = [
      {
        id: createSprintId('planned'),
        projectId,
        goal: 'Planned sprint',
        status: ProjectSprintStatusEnum.Planned,
        strategyType: ProjectSprintStrategyEnum.SoftwareDelivery,
        updatedAt: new Date('2026-04-18T08:00:00.000Z')
      },
      {
        id: createSprintId('review'),
        projectId,
        goal: 'Review sprint',
        status: ProjectSprintStatusEnum.Review,
        strategyType: ProjectSprintStrategyEnum.SoftwareDelivery,
        updatedAt: new Date('2026-04-18T09:00:00.000Z')
      },
      {
        id: createSprintId('running'),
        projectId,
        goal: 'Running sprint',
        status: ProjectSprintStatusEnum.Running,
        strategyType: ProjectSprintStrategyEnum.SoftwareDelivery,
        updatedAt: new Date('2026-04-18T07:00:00.000Z')
      }
    ]

    expect(pickDefaultSprint(sprints)?.id).toBe('running')
  })

  it('falls back to the default sprint when the requested sprint id is missing or invalid', () => {
    const projectId = createProjectId('project-1')

    const sprints: IProjectSprint[] = [
      {
        id: createSprintId('planned'),
        projectId,
        goal: 'Planned sprint',
        status: ProjectSprintStatusEnum.Planned,
        strategyType: ProjectSprintStrategyEnum.SoftwareDelivery,
        updatedAt: new Date('2026-04-18T08:00:00.000Z')
      },
      {
        id: createSprintId('running'),
        projectId,
        goal: 'Running sprint',
        status: ProjectSprintStatusEnum.Running,
        strategyType: ProjectSprintStrategyEnum.SoftwareDelivery,
        updatedAt: new Date('2026-04-18T07:00:00.000Z')
      }
    ]

    expect(pickRequestedSprint(sprints, 'missing')?.id).toBe('running')
    expect(pickRequestedSprint(sprints, 'planned')?.id).toBe('planned')
  })

  it('sorts swimlanes by sortOrder and groups tasks by lane', () => {
    const projectId = createProjectId('project-1')
    const sprintId = createSprintId('sprint-1')

    const swimlanes: IProjectSwimlane[] = [
      {
        id: 'lane-2',
        projectId,
        sprintId,
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
        projectId,
        sprintId,
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
        projectId,
        sprintId,
        swimlaneId: 'lane-2',
        title: 'Review API',
        sortOrder: 1,
        status: ProjectTaskStatusEnum.Todo,
        dependencies: [],
        updatedAt: new Date('2026-04-18T08:00:00.000Z')
      },
      {
        id: 'task-2',
        projectId,
        sprintId,
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

  it('keeps the reserved backlog swimlane discoverable and ordered first', () => {
    const projectId = createProjectId('project-1')
    const sprintId = createSprintId('sprint-1')

    const swimlanes: IProjectSwimlane[] = [
      {
        id: 'lane-coding',
        projectId,
        sprintId,
        key: 'coding',
        name: 'Coding',
        kind: ProjectSwimlaneKindEnum.Execution,
        priority: 2,
        weight: 2,
        concurrencyLimit: 2,
        wipLimit: 2,
        agentRole: ProjectAgentRole.Coder,
        environmentType: ProjectExecutionEnvironmentType.Container,
        sortOrder: 2,
        sourceStrategyType: ProjectSprintStrategyEnum.SoftwareDelivery
      },
      {
        id: 'lane-backlog',
        projectId,
        sprintId,
        key: ProjectSystemSwimlaneKeyEnum.Backlog,
        name: 'Backlog',
        kind: ProjectSwimlaneKindEnum.Backlog,
        priority: 0,
        weight: 0,
        concurrencyLimit: 0,
        wipLimit: 0,
        agentRole: ProjectAgentRole.Planner,
        environmentType: ProjectExecutionEnvironmentType.Browser,
        sortOrder: 0,
        sourceStrategyType: ProjectSprintStrategyEnum.SoftwareDelivery
      }
    ]

    const columns = buildProjectBoardColumns(swimlanes, [])

    expect(getBacklogSwimlane(swimlanes)?.id).toBe('lane-backlog')
    expect(columns[0].lane.id).toBe('lane-backlog')
    expect(columns[0].lane.kind).toBe(ProjectSwimlaneKindEnum.Backlog)
    expect(columns[1].lane.agentRole).toBe(ProjectAgentRole.Coder)
    expect(columns[1].lane.environmentType).toBe(ProjectExecutionEnvironmentType.Container)
  })

  it('formats strategy and status labels for display', () => {
    expect(formatProjectLabel('software_delivery')).toBe('Software Delivery')
    expect(formatProjectLabel('in-progress')).toBe('In Progress')
  })
})
