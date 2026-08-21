import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { IPagination } from '../core.model'
import { IIntegration } from '../integration.model'
import { IStorageFile, TFile } from '../storage-file.model'
import { TAvatar } from '../types'
import { IUser } from '../user.model'
import { ICopilotModel } from './copilot-model.model'
import { IKnowledgebase } from './knowledgebase.model'
import { IXpertToolset } from './xpert-toolset.model'
import { IXpertWorkspace } from './xpert-workspace.model'
import { IXpert, TXpertTeamDraft } from './xpert.model'

export type TXpertProjectSettings = {
  instruction: string
  mode?: '' | 'plan'
}
export type TXpertProjectStatus = 'active' | 'deprecated' | 'archived'
export type TXpertProjectPlanStatus = 'draft' | 'active' | 'completed' | 'archived'
export type TXpertProjectMilestoneStatus = 'planned' | 'in_progress' | 'completed' | 'blocked'
export type TXpertProjectTaskStatus = 'todo' | 'in_progress' | 'review' | 'done' | 'blocked' | 'cancelled'
export type TXpertProjectTaskPriority = 'urgent' | 'high' | 'medium' | 'low'
export type TXpertProjectPlanView = 'board' | 'table'
export type TXpertProjectAssetKind = 'file' | 'folder'
export type TXpertProjectAssetSource = 'upload' | 'ai_output' | 'conversation' | 'import'
export type TXpertProjectAutomationTrigger =
  | 'schedule'
  | 'task.status_changed'
  | 'asset.created'
  | 'conversation.completed'
export type TXpertProjectAutomationRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export enum XpertProjectTaskStatusEnum {
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  REVIEW = 'review',
  DONE = 'done',
  BLOCKED = 'blocked',
  CANCELLED = 'cancelled'
}

export enum XpertProjectTaskPriorityEnum {
  URGENT = 'urgent',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low'
}

export enum XpertProjectPlanViewEnum {
  BOARD = 'board',
  TABLE = 'table'
}

export enum XpertProjectAssetSourceEnum {
  UPLOAD = 'upload',
  AI_OUTPUT = 'ai_output',
  CONVERSATION = 'conversation',
  IMPORT = 'import'
}

export enum XpertProjectAutomationTriggerEnum {
  SCHEDULE = 'schedule',
  TASK_STATUS_CHANGED = 'task.status_changed',
  ASSET_CREATED = 'asset.created',
  CONVERSATION_COMPLETED = 'conversation.completed'
}

export enum XpertProjectAutomationRunStatusEnum {
  QUEUED = 'queued',
  RUNNING = 'running',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export type TXpertProject = {
  name: string
  avatar?: TAvatar
  description?: string
  status: TXpertProjectStatus
  settings?: TXpertProjectSettings

  // Used copilot model
  copilotModel?: ICopilotModel
  copilotModelId?: string

  vcsId?: string
}

/**
 * Expert Project
 */
export interface IXpertProject extends TXpertProject, IBasePerTenantAndOrganizationEntityModel {
  workspaceId?: string
  workspace?: IXpertWorkspace

  // Many to one
  ownerId: string
  owner?: IUser

  // One to many
  xperts?: IXpert[]
  toolsets?: IXpertToolset[]
  knowledges?: IKnowledgebase[]
  members?: IUser[]
  /**
   * @deprecated Use project file volume / FileAsset workspace projection instead.
   */
  files?: IXpertProjectFile[]
  /**
   * @deprecated Use project file volume / FileAsset workspace projection instead.
   */
  attachments?: IStorageFile[]

  vcs?: IXpertProjectVCS
}

export interface IBasePerXpertProjectEntityModel extends IBasePerTenantAndOrganizationEntityModel {
  projectId?: string
  project?: IXpertProject
}

export interface IXpertProjectTask extends IBasePerXpertProjectEntityModel {
  threadId?: string
  name: string
  title?: string
  description?: string
  type?: string
  status: TXpertProjectTaskStatus | 'pending' | 'completed' | 'failed'
  priority?: TXpertProjectTaskPriority
  assigneeId?: string
  assignee?: IUser
  dueDate?: Date
  planId?: string
  milestoneId?: string
  column?: string
  order?: number
  plan?: IXpertProjectPlan
  milestone?: IXpertProjectMilestone
  steps: IXpertProjectTaskStep[]
}

export interface IXpertProjectTaskStep extends IBasePerXpertProjectEntityModel {
  taskId: string
  stepIndex: number
  description: string
  notes: string
  status: 'pending' | 'running' | 'done' | 'failed'
}

export interface IXpertProjectTaskLog extends IBasePerXpertProjectEntityModel {
  stepId: string
  logType: 'input' | 'output' | 'error'
  content: string
}

/**
 * @deprecated use CodeXpert instead
 */
export interface IXpertProjectVCS extends IBasePerXpertProjectEntityModel {
  integrationId?: string
  integration?: IIntegration
  auth?: {
    token_type?: string
    access_token?: string
    state?: string
  }
  installationId?: number | string // For GitHub Apps
  repository?: string
}

/**
 * @deprecated Use project file volume / FileAsset workspace projection instead.
 */
export interface IXpertProjectFile extends IBasePerXpertProjectEntityModel, Omit<TFile, 'createdAt' | 'updatedAt'> {}

export type TXpertProjectDSL = IXpertProject & {
  xperts?: TXpertTeamDraft[]
  plans?: IXpertProjectPlan[]
  milestones?: IXpertProjectMilestone[]
  automations?: IXpertProjectAutomation[]
}

export interface IXpertProjectPlan extends IBasePerXpertProjectEntityModel {
  name: string
  description?: string
  status: TXpertProjectPlanStatus
  view?: TXpertProjectPlanView
  startDate?: Date
  dueDate?: Date
  order?: number
  milestones?: IXpertProjectMilestone[]
}

export interface IXpertProjectMilestone extends IBasePerXpertProjectEntityModel {
  planId: string
  plan?: IXpertProjectPlan
  name: string
  description?: string
  status: TXpertProjectMilestoneStatus
  dueDate?: Date
  order?: number
}

export interface IXpertProjectActivity extends IBasePerXpertProjectEntityModel {
  type: string
  entityType?: string
  entityId?: string
  summary: string
  payload?: Record<string, unknown>
  actor?: IUser
}

export interface IXpertProjectAsset extends IBasePerXpertProjectEntityModel {
  parentId?: string
  parent?: IXpertProjectAsset
  name: string
  path: string
  kind: TXpertProjectAssetKind
  mimeType?: string
  size?: number
  source: TXpertProjectAssetSource
  taskId?: string
  conversationId?: string
  status?: 'available' | 'processing' | 'failed'
}

export interface IXpertProjectAutomation extends IBasePerXpertProjectEntityModel {
  name: string
  enabled: boolean
  trigger: {
    type: TXpertProjectAutomationTrigger
    cron?: string
    timezone?: string
    eventType?: string
  }
  actions: Array<Record<string, unknown>>
  lastRunAt?: Date
  nextRunAt?: Date
  runs?: IXpertProjectAutomationRun[]
}

export interface IXpertProjectAutomationRun extends IBasePerXpertProjectEntityModel {
  automationId: string
  automation?: IXpertProjectAutomation
  status: TXpertProjectAutomationRunStatus
  occurrenceKey: string
  jobId?: string
  startedAt?: Date
  completedAt?: Date
  error?: string
  output?: Record<string, unknown>
}

export type TXpertProjectPage<T> = IPagination<T>

export type IXpertProjectPlanInput = Partial<Omit<IXpertProjectPlan, 'id' | 'projectId' | 'project' | 'milestones'>>
export type IXpertProjectMilestoneInput = Partial<Omit<IXpertProjectMilestone, 'id' | 'projectId' | 'project' | 'plan'>>
export type IXpertProjectActivityInput = Pick<IXpertProjectActivity, 'type' | 'summary'> &
  Partial<Pick<IXpertProjectActivity, 'entityType' | 'entityId' | 'payload'>>
export type IXpertProjectAssetInput = Partial<Omit<IXpertProjectAsset, 'id' | 'projectId' | 'project' | 'parent'>>
export type IXpertProjectAutomationInput = Partial<
  Omit<IXpertProjectAutomation, 'id' | 'projectId' | 'project' | 'runs'>
>
