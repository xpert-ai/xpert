import { XpertId } from '../ai/xpert-id.type'
import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { TeamId } from '../team/team-id.type'
import type { IProjectCore } from './project-core.model'
import { ProjectId, SprintId } from './project-id.type'
import type { IProjectSprint } from './project-sprint.model'
import type { IProjectTask } from './project-task.model'

export enum ProjectTaskExecutionStatusEnum {
	Pending = 'pending',
	Running = 'running',
	Success = 'success',
	Failed = 'failed'
}

export enum ProjectTaskExecutionOutcomeEnum {
	Success = 'success',
	Failed = 'failed'
}

export enum ProjectTaskExecutionArtifactTypeEnum {
	ProjectFile = 'project_file',
	ProjectDirectory = 'project_directory',
	ExternalUrl = 'external_url'
}

interface IProjectTaskExecutionArtifactBase {
	name: string
	metadata?: unknown
}

export interface IProjectTaskExecutionProjectFileArtifact extends IProjectTaskExecutionArtifactBase {
	type: ProjectTaskExecutionArtifactTypeEnum.ProjectFile
	path: string
}

export interface IProjectTaskExecutionProjectDirectoryArtifact extends IProjectTaskExecutionArtifactBase {
	type: ProjectTaskExecutionArtifactTypeEnum.ProjectDirectory
	path: string
}

export interface IProjectTaskExecutionExternalUrlArtifact extends IProjectTaskExecutionArtifactBase {
	type: ProjectTaskExecutionArtifactTypeEnum.ExternalUrl
	url: string
}

export type IProjectTaskExecutionArtifact =
	| IProjectTaskExecutionProjectFileArtifact
	| IProjectTaskExecutionProjectDirectoryArtifact
	| IProjectTaskExecutionExternalUrlArtifact

export interface IProjectTaskExecution extends IBasePerTenantAndOrganizationEntityModel {
	projectId: ProjectId
	project?: IProjectCore
	sprintId: SprintId
	sprint?: IProjectSprint
	taskId: string
	task?: IProjectTask
	teamId: TeamId
	xpertId: XpertId
	dispatchId: string
	conversationId?: string | null
	agentExecutionId?: string | null
	status: ProjectTaskExecutionStatusEnum
	outcome?: ProjectTaskExecutionOutcomeEnum | null
	summary?: string | null
	artifacts?: IProjectTaskExecutionArtifact[] | null
	error?: string | null
	startedAt?: Date | null
	completedAt?: Date | null
}

export enum ProjectTaskDispatchSkippedReasonEnum {
	SprintNotRunning = 'sprint_not_running',
	Blocked = 'blocked',
	MissingTeam = 'missing_team',
	InvalidTeamAssignment = 'invalid_team_assignment',
	NoMatchingTeam = 'no_matching_team',
	CapacityFull = 'capacity_full',
	ClaimLost = 'claim_lost'
}

export interface IProjectTaskDispatchSkipped {
	taskId?: string
	reason: ProjectTaskDispatchSkippedReasonEnum
	message?: string
}

export interface IProjectTaskDispatchDispatched {
	taskId: string
	taskExecutionId: string
	teamId: TeamId
	xpertId: XpertId
	dispatchId: string
}

export interface IProjectTaskDispatchResult {
	dispatched: IProjectTaskDispatchDispatched[]
	skipped: IProjectTaskDispatchSkipped[]
}
