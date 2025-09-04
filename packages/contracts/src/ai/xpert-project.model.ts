import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
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
   * @deprecated Use *file volume* instead
   */
  files?: IXpertProjectFile[]
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
  type?: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
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
 * @deprecated Use `attachments`
 */
export interface IXpertProjectFile extends IBasePerXpertProjectEntityModel, Omit<TFile, 'createdAt'> {}

export type TXpertProjectDSL = IXpertProject & {
  xperts?: TXpertTeamDraft[]
}
