import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { IUser } from '../user.model'
import { IUserGroup } from '../user-group.model'
import { WorkflowNodeTypeEnum } from './xpert-workflow.model'
import type { IXpert, TXpertTeamDraft, TXpertTeamNode } from './xpert.model'

export const XpertMarketplaceBusinessCategories = [
  'knowledge-management',
  'sales-growth',
  'data-analysis',
  'workflow-automation',
  'legal-compliance',
  'content-creation',
  'customer-service'
] as const

export type TXpertMarketplaceBusinessCategory = (typeof XpertMarketplaceBusinessCategories)[number]

export const XpertMarketplaceCollaborationModes = ['single-agent', 'multi-agent', 'human-in-loop'] as const

export type TXpertMarketplaceCollaborationMode = (typeof XpertMarketplaceCollaborationModes)[number]

export const XpertMarketplaceTechnicalCategories = [
  'knowledge-retrieval',
  'tool-calling',
  'workflow',
  'external-xpert',
  'file-understanding',
  'sandbox',
  'trigger',
  'http',
  'code',
  'database',
  'structured-output'
] as const

export type TXpertMarketplaceTechnicalCategory = (typeof XpertMarketplaceTechnicalCategories)[number]

export type TXpertMarketplaceTechnicalProfile = {
  agentCount: number
  toolsetCount: number
  knowledgebaseCount: number
  externalXpertCount: number
  workflowNodeCount: number
  workflowNodeTypes: WorkflowNodeTypeEnum[]
  categories: TXpertMarketplaceTechnicalCategory[]
  collaborationModes: TXpertMarketplaceCollaborationMode[]
}

export type TXpertMarketplaceProfile = {
  summary?: string | null
  businessCategories?: TXpertMarketplaceBusinessCategory[]
  capabilityTags?: string[]
  collaborationModes?: TXpertMarketplaceCollaborationMode[]
  technical?: TXpertMarketplaceTechnicalProfile
  featured?: boolean
}

export enum XpertAccessRequestStatusEnum {
  REQUESTED = 'requested',
  APPROVED = 'approved',
  REJECTED = 'rejected'
}

export type XpertAccessRequestStatus =
  | XpertAccessRequestStatusEnum.REQUESTED
  | XpertAccessRequestStatusEnum.APPROVED
  | XpertAccessRequestStatusEnum.REJECTED

export type TXpertMarketplaceAccessStatus =
  | 'not_requested'
  | 'requested'
  | 'approved'
  | 'rejected'
  | 'accessible'
  | 'owned'

export interface IXpertAccessRequest extends IBasePerTenantAndOrganizationEntityModel {
  xpertId: string
  xpert?: IXpert
  requesterId: string
  requester?: IUser
  reviewerId?: string | null
  reviewer?: IUser | null
  accessGroupId?: string | null
  accessGroup?: IUserGroup | null
  status: XpertAccessRequestStatus
  reason?: string | null
  response?: string | null
  reviewedAt?: Date | string | null
}

export type TXpertMarketplaceQuery = {
  search?: string | null
  businessCategories?: TXpertMarketplaceBusinessCategory[]
  capabilityTags?: string[]
  collaborationModes?: TXpertMarketplaceCollaborationMode[]
  technicalCategories?: TXpertMarketplaceTechnicalCategory[]
  status?: TXpertMarketplaceAccessStatus | null
  sort?: 'match' | 'hot' | 'updated'
  skip?: number
  take?: number
}

export type TXpertAccessRequestCreateInput = {
  reason?: string | null
}

export type TXpertAccessRequestDecisionInput = {
  response?: string | null
}

export type TXpertPublishMarketplaceInput = Pick<
  TXpertMarketplaceProfile,
  'summary' | 'businessCategories' | 'capabilityTags' | 'featured'
>

export type IXpertMarketplaceItem = {
  xpert: IXpert
  marketplace: TXpertMarketplaceProfile
  accessStatus: TXpertMarketplaceAccessStatus
  request?: IXpertAccessRequest | null
  canReview: boolean
}

export type IXpertMarketplaceListResponse = {
  items: IXpertMarketplaceItem[]
  total: number
  reviewableCount: number
}

const databaseWorkflowTypes = new Set<WorkflowNodeTypeEnum>([
  WorkflowNodeTypeEnum.DB_SQL,
  WorkflowNodeTypeEnum.DB_INSERT,
  WorkflowNodeTypeEnum.DB_UPDATE,
  WorkflowNodeTypeEnum.DB_DELETE,
  WorkflowNodeTypeEnum.DB_QUERY
])

function addUnique<T>(items: T[], item: T) {
  if (!items.includes(item)) {
    items.push(item)
  }
}

function hasEnabledFileUnderstanding(node: TXpertTeamNode<'agent'>) {
  return node.entity.options?.fileUnderstanding?.enabled === true || node.entity.options?.attachment?.enabled === true
}

function hasStructuredOutput(node: TXpertTeamNode<'agent'>) {
  return !!node.entity.outputVariables?.length || !!node.entity.options?.structuredOutputMethod
}

export function deriveXpertMarketplaceTechnicalProfile(
  draft?: Pick<TXpertTeamDraft, 'nodes' | 'connections' | 'team'> | null
): TXpertMarketplaceTechnicalProfile {
  const nodes = draft?.nodes ?? []
  const connections = draft?.connections ?? []
  const categories: TXpertMarketplaceTechnicalCategory[] = []
  const workflowNodeTypes: WorkflowNodeTypeEnum[] = []

  const agentNodes = nodes.filter((node): node is TXpertTeamNode<'agent'> => node.type === 'agent')
  const knowledgebaseCount = nodes.filter((node) => node.type === 'knowledge').length
  const toolsetCount = nodes.filter((node) => node.type === 'toolset').length
  const externalXpertCount = nodes.filter((node) => node.type === 'xpert').length
  const workflowNodes = nodes.filter((node): node is TXpertTeamNode<'workflow'> => node.type === 'workflow')

  for (const node of workflowNodes) {
    addUnique(workflowNodeTypes, node.entity.type)
  }

  if (knowledgebaseCount > 0 || workflowNodeTypes.includes(WorkflowNodeTypeEnum.KNOWLEDGE)) {
    addUnique(categories, 'knowledge-retrieval')
  }
  if (
    toolsetCount > 0 ||
    workflowNodeTypes.includes(WorkflowNodeTypeEnum.TOOL) ||
    workflowNodeTypes.includes(WorkflowNodeTypeEnum.AGENT_TOOL)
  ) {
    addUnique(categories, 'tool-calling')
  }
  if (workflowNodes.length > 0 || connections.some((connection) => connection.type === 'edge')) {
    addUnique(categories, 'workflow')
  }
  if (externalXpertCount > 0 || connections.some((connection) => connection.type === 'xpert')) {
    addUnique(categories, 'external-xpert')
  }
  if (agentNodes.some(hasEnabledFileUnderstanding)) {
    addUnique(categories, 'file-understanding')
  }
  if (draft?.team.features?.sandbox?.enabled) {
    addUnique(categories, 'sandbox')
  }
  if (workflowNodeTypes.includes(WorkflowNodeTypeEnum.TRIGGER)) {
    addUnique(categories, 'trigger')
  }
  if (workflowNodeTypes.includes(WorkflowNodeTypeEnum.HTTP)) {
    addUnique(categories, 'http')
  }
  if (workflowNodeTypes.includes(WorkflowNodeTypeEnum.CODE)) {
    addUnique(categories, 'code')
  }
  if (workflowNodeTypes.some((type) => databaseWorkflowTypes.has(type))) {
    addUnique(categories, 'database')
  }
  if (agentNodes.some(hasStructuredOutput)) {
    addUnique(categories, 'structured-output')
  }

  const collaborationModes: TXpertMarketplaceCollaborationMode[] = []
  if (
    agentNodes.length > 1 ||
    externalXpertCount > 0 ||
    connections.some((connection) => connection.type === 'agent')
  ) {
    addUnique(collaborationModes, 'multi-agent')
  } else {
    addUnique(collaborationModes, 'single-agent')
  }
  if (draft?.team.agentConfig?.interruptBefore?.length) {
    addUnique(collaborationModes, 'human-in-loop')
  }

  return {
    agentCount: agentNodes.length,
    toolsetCount,
    knowledgebaseCount,
    externalXpertCount,
    workflowNodeCount: workflowNodes.length,
    workflowNodeTypes,
    categories,
    collaborationModes
  }
}

export function buildXpertMarketplaceProfileSnapshot(
  input: TXpertPublishMarketplaceInput | TXpertMarketplaceProfile | undefined | null,
  draft?: Pick<TXpertTeamDraft, 'nodes' | 'connections' | 'team'> | null
): TXpertMarketplaceProfile {
  const technical = deriveXpertMarketplaceTechnicalProfile(draft)
  const summary = input?.summary?.trim() || null
  const capabilityTags = Array.from(new Set(input?.capabilityTags?.map((tag) => tag.trim()).filter(Boolean) ?? []))

  return {
    summary,
    businessCategories: input?.businessCategories ?? [],
    capabilityTags,
    collaborationModes: technical.collaborationModes,
    technical,
    featured: input?.featured === true
  }
}
