import type {
  IProjectSprint,
  IProjectSwimlane,
  IProjectTask,
  IProjectTeamBinding,
  ITeamDefinition
} from '@xpert-ai/contracts'
import { ProjectSwimlaneKindEnum, ProjectSystemSwimlaneKeyEnum } from '@xpert-ai/contracts'

export interface ProjectBoundTeamViewModel {
  binding: IProjectTeamBinding
  team: ITeamDefinition
}

export interface ProjectBoardColumnViewModel {
  lane: IProjectSwimlane
  tasks: IProjectTask[]
  total: number
  todo: number
  doing: number
  done: number
}

export interface ProjectBoardTaskDropEvent {
  taskId: string
  sourceSwimlaneId: string
  targetSwimlaneId: string
  targetOrderedTaskIds: string[]
}

const ACTIVE_SPRINT_STATUS_PRIORITY: Record<string, number> = {
  running: 0,
  review: 1,
  planned: 2,
  done: 3
}

function toEpoch(value?: Date | string | null) {
  if (!value) {
    return 0
  }

  const timestamp = new Date(value).getTime()
  return Number.isNaN(timestamp) ? 0 : timestamp
}

export function pickDefaultSprint(sprints: IProjectSprint[]) {
	if (!sprints.length) {
		return null
	}

  return [...sprints].sort((left, right) => {
    const leftPriority = ACTIVE_SPRINT_STATUS_PRIORITY[left.status] ?? Number.MAX_SAFE_INTEGER
    const rightPriority = ACTIVE_SPRINT_STATUS_PRIORITY[right.status] ?? Number.MAX_SAFE_INTEGER
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority
    }

    return toEpoch(right.updatedAt ?? right.createdAt ?? right.endAt ?? right.startAt) -
      toEpoch(left.updatedAt ?? left.createdAt ?? left.endAt ?? left.startAt)
	})[0]
}

export function pickRequestedSprint(sprints: IProjectSprint[], sprintId?: string | null) {
  if (sprintId) {
    const requestedSprint = sprints.find((sprint) => sprint.id === sprintId)
    if (requestedSprint) {
      return requestedSprint
    }
  }

  return pickDefaultSprint(sprints)
}

export function buildProjectBoardColumns(swimlanes: IProjectSwimlane[], tasks: IProjectTask[]) {
  const tasksByLane = new Map<string, IProjectTask[]>()

  for (const task of tasks) {
    const laneTasks = tasksByLane.get(task.swimlaneId) ?? []
    laneTasks.push(task)
    tasksByLane.set(task.swimlaneId, laneTasks)
  }

  return [...swimlanes]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map<ProjectBoardColumnViewModel>((lane) => {
      const laneTasks = [...(tasksByLane.get(lane.id ?? '') ?? [])].sort(
        (left, right) =>
          (left.sortOrder ?? Number.MAX_SAFE_INTEGER) - (right.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
          toEpoch(left.createdAt) - toEpoch(right.createdAt)
      )

      return {
        lane,
        tasks: laneTasks,
        total: laneTasks.length,
        todo: laneTasks.filter((task) => task.status === 'todo').length,
        doing: laneTasks.filter((task) => task.status === 'doing').length,
        done: laneTasks.filter((task) => task.status === 'done').length
      }
    })
}

export function getBacklogSwimlane(swimlanes: IProjectSwimlane[]) {
  return swimlanes.find(
    (lane) =>
      lane.kind === ProjectSwimlaneKindEnum.Backlog || lane.key === ProjectSystemSwimlaneKeyEnum.Backlog
  ) ?? null
}

export function getDefaultTaskSwimlane(swimlanes: IProjectSwimlane[]) {
  return getBacklogSwimlane(swimlanes) ?? swimlanes[0] ?? null
}

export function formatProjectLabel(value?: string | null) {
  if (!value) {
    return ''
  }

  return value
    .split(/[_-]/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}
