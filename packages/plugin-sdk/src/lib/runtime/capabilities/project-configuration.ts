import type {
  IXpertTask,
  ProjectConfigurationOverview,
  ProjectConfigurationUpdate,
  ProjectConfigurationValues,
  TXpertTaskScheduleCapabilities,
  XpertProjectConfigurationView
} from '@xpert-ai/contracts'
import type {
  ConnectorAuthMethodDefinition,
  ConnectorBinding,
  ConnectorRuntimeOptions,
  ConnectorStrategyDefinition
} from '../../connector'
import { createRuntimeCapability } from '../../core/runtime-capability'
import type { RuntimeActor } from '../actor'

/** Supplied by the host from trusted request/execution context, never from an action/tool payload.
 * Background callers restore execution identity before invoking operations that use domain services.
 * assistantId retains the current Assistant-to-Project access check when invoked in its scope. */
export interface ProjectConfigurationScope {
  actor: RuntimeActor
  projectId: string
  assistantId?: string
}
export type ProjectConfigurationMemberRole = 'manager' | 'editor' | 'member'
export type ProjectConfigurationPageInput = { page: number; search: string }
export interface ProjectSkillArchive {
  buffer: Buffer
  originalname?: string
  mimetype?: string
  size?: number
}
export interface ProjectConfigurationPage {
  items: { id: string; name: string; description?: string }[]
  total: number
  page: number
}
export interface ProjectConfigurationMemberCandidates extends ProjectConfigurationPage {
  canInvite: boolean
  invitations: { id: string; email: string; role: ProjectConfigurationMemberRole; status: string }[]
}
export type ProjectConfigurationAutomationInput = Required<
  Pick<IXpertTask, 'name' | 'prompt' | 'xpertId' | 'options' | 'timeZone'>
> &
  Pick<IXpertTask, 'agentKey'> & {
    taskId?: string
    runtimeState?: ProjectConfigurationValues
  }
export interface ProjectConfigurationAutomationPage {
  items: Pick<
    IXpertTask,
    | 'id'
    | 'name'
    | 'prompt'
    | 'xpertId'
    | 'agentKey'
    | 'options'
    | 'timeZone'
    | 'status'
    | 'scheduleDescription'
    | 'runAsUserId'
    | 'pendingRunAsUserId'
    | 'runtimeState'
  >[]
  total: number
  page: number
}
export interface ProjectConfigurationAutomationOptions {
  capabilities: TXpertTaskScheduleCapabilities
  connectors: ConnectorRuntimeOptions
}
export interface ProjectConfigurationConnectors {
  bindings: ConnectorBinding[]
  definitions: {
    provider: string
    label: ConnectorStrategyDefinition['label']
    authMethods: ConnectorAuthMethodDefinition[]
  }[]
}
export interface ProjectConfigurationConnectorAuthorization {
  status: string
  authorizationUrl?: string
  stateExpiresAt?: string
}

/** Project configuration operations shared by plugins and trusted runtime callers.
 * Each call revalidates identity and domain permissions; this API does not grant machine principals
 * human management or consent authority. Browser OAuth launch still needs an authenticated HTTP origin. */
export interface ProjectConfigurationApi {
  /** Non-secret effective settings for authorized execution, including a Project Assistant. No management authority. */
  getRuntimeConfiguration(
    scope: ProjectConfigurationScope
  ): Promise<Pick<XpertProjectConfigurationView, 'projectType' | 'revision' | 'effectiveValues'>>
  getOverview(scope: ProjectConfigurationScope): Promise<ProjectConfigurationOverview>
  get(scope: ProjectConfigurationScope): Promise<XpertProjectConfigurationView>
  update(scope: ProjectConfigurationScope, input: ProjectConfigurationUpdate): Promise<XpertProjectConfigurationView>
  listAvailableAssistants(
    scope: ProjectConfigurationScope,
    input: ProjectConfigurationPageInput
  ): Promise<ProjectConfigurationPage>
  addAssistant(scope: ProjectConfigurationScope, input: { xpertId: string }): Promise<null>
  removeAssistant(scope: ProjectConfigurationScope, input: { xpertId: string }): Promise<null>
  listMemberCandidates(
    scope: ProjectConfigurationScope,
    input: ProjectConfigurationPageInput
  ): Promise<ProjectConfigurationMemberCandidates>
  addMember(
    scope: ProjectConfigurationScope,
    input: { userId: string; role?: ProjectConfigurationMemberRole }
  ): Promise<null>
  updateMemberRole(
    scope: ProjectConfigurationScope,
    input: { userId: string; role: ProjectConfigurationMemberRole }
  ): Promise<null>
  removeMember(scope: ProjectConfigurationScope, input: { userId: string }): Promise<null>
  transferOwnership(scope: ProjectConfigurationScope, input: { userId: string }): Promise<null>
  inviteMember(
    scope: ProjectConfigurationScope,
    input: { email: string; role: ProjectConfigurationMemberRole }
  ): Promise<null>
  revokeInvitation(scope: ProjectConfigurationScope, input: { invitationId: string }): Promise<null>
  listSkillCatalog(
    scope: ProjectConfigurationScope,
    input: ProjectConfigurationPageInput
  ): Promise<ProjectConfigurationPage>
  installSkill(scope: ProjectConfigurationScope, input: { indexId: string }): Promise<null>
  setSkillEnabled(scope: ProjectConfigurationScope, input: { skillId: string; enabled: boolean }): Promise<null>
  removeSkill(scope: ProjectConfigurationScope, input: { skillId: string }): Promise<null>
  deleteProject(scope: ProjectConfigurationScope, input: { name: string }): Promise<null>
  listAutomations(
    scope: ProjectConfigurationScope,
    input: ProjectConfigurationPageInput
  ): Promise<ProjectConfigurationAutomationPage>
  getAutomationOptions(
    scope: ProjectConfigurationScope,
    input: { xpertId: string; agentKey?: string }
  ): Promise<ProjectConfigurationAutomationOptions>
  saveAutomation(scope: ProjectConfigurationScope, input: ProjectConfigurationAutomationInput): Promise<null>
  pauseAutomation(scope: ProjectConfigurationScope, input: { taskId: string }): Promise<null>
  resumeAutomation(scope: ProjectConfigurationScope, input: { taskId: string }): Promise<null>
  deleteAutomation(scope: ProjectConfigurationScope, input: { taskId: string }): Promise<null>
  proposeAutomationRunAs(scope: ProjectConfigurationScope, input: { taskId: string; userId: string }): Promise<null>
  acceptAutomationRunAs(scope: ProjectConfigurationScope, input: { taskId: string }): Promise<null>
  updateAutomationConnectors(
    scope: ProjectConfigurationScope,
    input: { taskId: string; runtimeState: ProjectConfigurationValues }
  ): Promise<null>
  listConnectors(scope: ProjectConfigurationScope): Promise<ProjectConfigurationConnectors>
  addConnector(scope: ProjectConfigurationScope, input: { provider: string }): Promise<null>
  removeConnector(scope: ProjectConfigurationScope, input: { bindingId: string }): Promise<null>
  getConnectorAuthorizationStatus(
    scope: ProjectConfigurationScope,
    input: { bindingId: string }
  ): Promise<ProjectConfigurationConnectorAuthorization>
  cancelConnectorAuthorization(scope: ProjectConfigurationScope, input: { bindingId: string }): Promise<null>
  connectConnector(
    scope: ProjectConfigurationScope,
    input: { bindingId: string; authMethodId?: string; values?: Record<string, string> }
  ): Promise<ProjectConfigurationConnectorAuthorization>
  updateInstructions(scope: ProjectConfigurationScope, content: string): Promise<void>
  uploadSkill(scope: ProjectConfigurationScope, file: ProjectSkillArchive): Promise<void>
}

export const ProjectConfigurationRuntimeCapability = createRuntimeCapability<ProjectConfigurationApi>(
  'platform.project.configuration',
  { description: 'Authorized Project configuration, membership, skills, connectors and automation operations.' }
)
