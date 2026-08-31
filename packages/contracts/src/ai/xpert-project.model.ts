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
  managementMode?: TXpertProjectManagementMode
  /** Explicit default Assistant used by the Project assistant panel and task orchestration. */
  projectAssistantId?: string
}
export type TXpertProjectManagementMode = 'simple' | 'advanced'
export type TXpertProjectMemberRole = 'manager' | 'editor' | 'member'
export type TXpertProjectAccessRole = 'owner' | TXpertProjectMemberRole
export type TXpertProjectAccessSummary = {
  role: TXpertProjectAccessRole
  capabilities: {
    canRead: boolean
    canEdit: boolean
    canManage: boolean
    canUse: boolean
  }
}
export type TXpertProjectMemberSummary = {
  id: string
  firstName?: string
  lastName?: string
  email?: string
  username?: string
  imageUrl?: string
  membershipId?: string
  projectRole: TXpertProjectAccessRole
  joinedAt?: Date
}
export type TXpertProjectMemberInput = { userId: string; role?: TXpertProjectMemberRole }
export type TXpertProjectMemberRoleInput = { role: TXpertProjectMemberRole }
export type TXpertProjectStatus = 'active' | 'deprecated' | 'archived'
export type TXpertProjectPlanStatus = 'draft' | 'active' | 'completed' | 'archived'
export type TXpertProjectMilestoneStatus = 'planned' | 'in_progress' | 'completed' | 'blocked'
export type TXpertProjectTaskStatus = 'todo' | 'in_progress' | 'review' | 'paused' | 'done' | 'blocked' | 'cancelled'
export type TXpertProjectTaskPriority = 'urgent' | 'high' | 'medium' | 'low'
export type TXpertProjectPlanView = 'board' | 'table' | 'gantt' | 'calendar' | 'list'
export type TXpertProjectSprintStatus = 'planned' | 'running' | 'review' | 'done'
export type TXpertProjectSprintStrategy = 'software_delivery' | 'data_analysis'
export type TXpertProjectSwimlaneKind = 'backlog' | 'execution'
export type TXpertProjectAgentRole =
  | 'planner'
  | 'coder'
  | 'reviewer'
  | 'operator'
  | 'researcher'
  | 'analyst'
  | 'visualizer'
export type TXpertProjectExecutionEnvironment = 'browser' | 'container' | 'terminal'
export type TXpertProjectTaskConversationRelation = 'origin' | 'discussion' | 'execution' | 'review'
export type TXpertProjectTaskExecutionStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
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
  PAUSED = 'paused',
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
  TABLE = 'table',
  GANTT = 'gantt',
  CALENDAR = 'calendar',
  LIST = 'list'
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
  memberships?: IXpertProjectMembership[]
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

export interface IXpertProjectMembership extends IBasePerTenantAndOrganizationEntityModel {
  projectId: string
  project?: IXpertProject
  userId: string
  user?: IUser
  role: TXpertProjectMemberRole
  invitedById?: string
  invitedBy?: IUser
  joinedAt: Date
  removedAt?: Date
}

export type IXpertProjectCreateInput = Partial<IXpertProject> & {
  xpertIds?: string[]
  toolsetIds?: string[]
  knowledgebaseIds?: string[]
  memberIds?: string[]
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
  /** Project Assistant responsible for executing this task. */
  assigneeXpertId?: string
  dueDate?: Date
  planId?: string
  milestoneId?: string
  column?: string
  order?: number
  plan?: IXpertProjectPlan
  milestone?: IXpertProjectMilestone
  steps: IXpertProjectTaskStep[]
  conversations?: IXpertProjectTaskConversation[]
  executions?: IXpertProjectTaskExecution[]
}

export interface IXpertProjectTaskConversation extends IBasePerXpertProjectEntityModel {
  taskId: string
  conversationId: string
  relationType: TXpertProjectTaskConversationRelation
  isPrimary?: boolean
  sourceMessageId?: string
  sourceExecutionId?: string
}

export interface IXpertProjectTaskExecution extends IBasePerXpertProjectEntityModel {
  taskId: string
  conversationId?: string
  threadId?: string
  agentExecutionId?: string
  xpertId?: string
  agentKey?: string
  attempt: number
  status: TXpertProjectTaskExecutionStatus
  inputSummary?: string
  outputSummary?: string
  error?: string
  artifactIds?: string[]
  startedAt?: Date
  completedAt?: Date
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
  sprints?: IXpertProjectSprint[]
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

export interface IXpertProjectSprint extends IBasePerXpertProjectEntityModel {
  planId?: string
  plan?: IXpertProjectPlan
  goal: string
  status: TXpertProjectSprintStatus
  strategyType: TXpertProjectSprintStrategy
  startAt?: Date
  endAt?: Date
  retrospective?: string
  swimlanes?: IXpertProjectSwimlane[]
}

export interface IXpertProjectSwimlane extends IBasePerXpertProjectEntityModel {
  sprintId: string
  sprint?: IXpertProjectSprint
  key: string
  name: string
  kind: TXpertProjectSwimlaneKind
  priority: number
  weight: number
  concurrencyLimit: number
  wipLimit: number
  agentRole: TXpertProjectAgentRole
  environmentType: TXpertProjectExecutionEnvironment
  sortOrder: number
  sourceStrategyType: TXpertProjectSprintStrategy
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
