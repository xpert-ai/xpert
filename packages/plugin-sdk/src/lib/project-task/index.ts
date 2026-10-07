import { applyDecorators, Injectable, SetMetadata } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import type {
  ProjectTaskGraph,
  ProjectTaskGraphChange,
  ProjectTaskExecutionTarget,
  ProjectTaskTypeDefinition,
  TXpertProjectTaskStatus
} from '@xpert-ai/contracts'
import { BaseStrategyRegistry } from '../strategy'
import { STRATEGY_META_KEY } from '../types'
import { createRuntimeCapability } from '../core/runtime-capability'
import type { ProjectAccessActor } from '../runtime/capabilities/project-access'

export interface ProjectTaskContext {
  actor: ProjectAccessActor
  projectId: string
}

export interface ProjectTaskProjection {
  key: string
  title: string
  status: TXpertProjectTaskStatus
  /** Completion percentage (0–100), independent of status. Omit to preserve; null clears it. */
  progress?: number | null
  kind: 'task' | 'summary' | 'milestone'
  /** Registered business type; omitted values preserve legacy persisted types. Null explicitly clears it. */
  taskType?: string | null
  parentKey?: string
  predecessorKeys: string[]
  diagnostic?: string
  assigneeXpertId?: string
  executions: Array<{
    key: string
    attempt: number
    agentExecutionId?: string
    conversationId?: string
    threadId?: string
    xpertId?: string
    agentKey?: string
    status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
    startedAt?: string
    completedAt?: string
    error?: string
    outputSummary?: string
  }>
}

/** Domain facts remain durable in the provider; projection can be replayed after interruption. */
export interface ProjectTaskSnapshot {
  revision: string
  tasks: ProjectTaskProjection[]
}

export interface IProjectTaskProvider {
  readonly key: string
  /** Presentation declarations belong to this provider and never contain executable icon code. */
  readonly taskTypes?: readonly ProjectTaskTypeDefinition[]
  /** Return null when the project is not owned by this provider. Always scope domain reads. */
  snapshot(context: ProjectTaskContext): Promise<ProjectTaskSnapshot | null>
  /** Called after projection commits; retries must be idempotent. Never start work here. */
  linked?(context: ProjectTaskContext, links: Array<{ sourceKey: string; taskId: string }>): Promise<void>
}

export type { ProjectTaskIconName, ProjectTaskTypeDefinition, ProjectTaskTypePresentation } from '@xpert-ai/contracts'

export const PROJECT_TASK_PROVIDER = 'PROJECT_TASK_PROVIDER'
export const ProjectTaskProvider = (key: string) =>
  applyDecorators(SetMetadata(PROJECT_TASK_PROVIDER, key), SetMetadata(STRATEGY_META_KEY, PROJECT_TASK_PROVIDER))

@Injectable()
export class ProjectTaskProviderRegistry extends BaseStrategyRegistry<IProjectTaskProvider> {
  constructor(discovery: DiscoveryService, reflector: Reflector) {
    super(PROJECT_TASK_PROVIDER, discovery, reflector)
  }
}

/** ORM-independent project task management; actor values come from trusted server context. */
export interface ProjectTasksApi {
  graph(context: ProjectTaskContext): Promise<ProjectTaskGraph>
  change(context: ProjectTaskContext, input: ProjectTaskGraphChange): Promise<ProjectTaskGraph>
  resolveExecution(context: ProjectTaskContext, taskExecutionId: string): Promise<ProjectTaskExecutionTarget>
}
export const ProjectTasksRuntimeCapability = createRuntimeCapability<ProjectTasksApi>('platform.project.tasks', {
  description: 'Read project task graphs, manage schedules, and resolve exact execution conversations.'
})
