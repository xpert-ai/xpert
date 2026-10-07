import type { TXpertProjectTaskStatus, IXpertProjectTaskExecution } from './xpert-project.model'
import type { TAvatar } from '../types'
import type { ProjectTaskTypePresentation } from './project-task-type.model'

/** Stable logical work identity. Attempts and conversations never substitute for a task. */
export interface ProjectTaskNode {
  id: string
  title: string
  status: TXpertProjectTaskStatus
  /** Measured completion percentage (0–100); null/omitted means unknown. Independent of status. */
  progress?: number | null
  kind: 'task' | 'summary' | 'milestone'
  /** Business classification, independent of hierarchy, status and assignee. */
  taskType?: string | null
  /** Resolved by the owning provider's registration; unknown types have no presentation. */
  presentation?: ProjectTaskTypePresentation | null
  parentTaskId: string | null
  predecessorIds: string[]
  providerKey: string | null
  sourceKey: string | null
  revision: number
  plannedStartAt: string | null
  plannedEndAt: string | null
  estimatedDurationMs: number | null
  actualStartAt: string | null
  actualEndAt: string | null
  diagnostic: string | null
  assigneeXpertId: string | null
  /** Display identity resolved by the platform, never inferred from a task title. */
  assigneeName?: string | null
  /** Assistant avatar resolved within the same authorized scope as its display name. */
  assigneeAvatar?: TAvatar | null
}

export interface ProjectTaskGraph {
  projectId: string
  projectTitle?: string
  /** Server-derived capability. Mutations must still authorize on the server. */
  canEditPlan?: boolean
  cursor: string
  tasks: ProjectTaskNode[]
  executions: IXpertProjectTaskExecution[]
  /** Provider failures remain visible; a partial refresh must not look complete. */
  diagnostics: Array<{ providerKey: string; message: string }>
}

export interface ProjectTaskGraphChange {
  taskId: string
  expectedRevision: number
  parentTaskId?: string | null
  predecessorIds?: string[]
  plannedStartAt?: string | null
  plannedEndAt?: string | null
  estimatedDurationMs?: number | null
}

export type { ProjectTaskForecast } from './project-task-schedule'

export interface ProjectTaskExecutionTarget {
  projectId: string
  taskId: string
  taskExecutionId: string
  conversationId: string
  threadId: string
  agentExecutionId: string
  xpertId: string
}
