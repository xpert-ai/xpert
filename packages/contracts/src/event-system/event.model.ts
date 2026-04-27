import type { IProjectTask } from '../project/project-task.model'
import type { IProjectTaskExecution } from '../project/project-task-execution.model'
import type { IProjectSprint } from '../project/project-sprint.model'
import type { IProjectSwimlane } from '../project/project-swimlane.model'
import type { XpertEventType } from './event-types'

export type XpertEventSourceType = 'agent' | 'workflow' | 'system' | 'tool' | 'handoff' | 'chat' | 'project'

export interface XpertEventScope {
	projectId?: string
	sprintId?: string
	taskId?: string
	taskExecutionId?: string
	conversationId?: string
	agentExecutionId?: string
	xpertId?: string
}

export interface XpertEventSource {
	type: XpertEventSourceType
	id: string
	name?: string
}

export interface XpertEventMeta {
	tenantId?: string
	organizationId?: string | null
	userId?: string | null
	traceId?: string
	requestId?: string
}

export interface XpertEvent<TPayload = unknown> {
	id: string
	type: XpertEventType | string
	version: number
	scope: XpertEventScope
	source: XpertEventSource
	payload: TPayload
	meta?: XpertEventMeta
	timestamp: number
}

export interface XpertEventRecord<TPayload = unknown> extends XpertEvent<TPayload> {
	streamId: string
}

export interface XpertEventCreateInput<TPayload = unknown> {
	type: XpertEventType | string
	version?: number
	scope?: XpertEventScope
	source: XpertEventSource
	payload: TPayload
	meta?: XpertEventMeta
}

export interface XpertEventFilter extends XpertEventScope {
	type?: XpertEventType | string
	afterId?: string
	limit?: number
}

export type XpertProjectTaskPatch = Omit<Partial<IProjectTask>, 'id'> & {
	id: string
}

export type XpertProjectTaskExecutionPatch = Partial<IProjectTaskExecution> & {
	id: string
	taskId: string
}

export interface XpertProjectTaskEventPayload {
	taskId: string
	taskExecutionId?: string
	dispatchId?: string
	task?: XpertProjectTaskPatch
	latestExecution?: XpertProjectTaskExecutionPatch
	error?: string | null
}

export type XpertProjectBoardChangedOperation =
	| 'task.created'
	| 'task.updated'
	| 'task.moved'
	| 'task.reordered'
	| 'sprint.created'
	| 'sprint.updated'
	| 'swimlanes.updated'

export type XpertProjectSprintPatch = Omit<Partial<IProjectSprint>, 'id'> & {
	id: string
}

export type XpertProjectSwimlanePatch = Omit<Partial<IProjectSwimlane>, 'id'> & {
	id: string
}

export interface XpertProjectBoardChangedEventPayload {
	operation: XpertProjectBoardChangedOperation
	projectId: string
	sprintId?: string | null
	tasks?: XpertProjectTaskPatch[]
	sprint?: XpertProjectSprintPatch
	swimlanes?: XpertProjectSwimlanePatch[]
	requiresRefresh?: boolean
}
