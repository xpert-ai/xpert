import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { IUser } from '../user.model'
import { LongTermMemoryTypeEnum } from './xpert.model'

export interface ICopilotStore extends TCopilotStore, IBasePerTenantAndOrganizationEntityModel {}

export interface ICopilotStoreVector extends TCopilotStoreVector, IBasePerTenantAndOrganizationEntityModel {}

export type TCopilotStore = {
  prefix: string
  key?: string
  value: any
}

export type TCopilotStoreVector = {
  prefix: string
  key: string
  field_name: any
  embedding: number[]
}

export enum MemoryScopeTypeEnum {
  XPERT = 'xpert',
  WORKSPACE = 'workspace'
}

export enum MemoryAudienceEnum {
  USER = 'user',
  SHARED = 'shared'
}

export enum MemoryRecordStatusEnum {
  ACTIVE = 'active',
  FROZEN = 'frozen',
  ARCHIVED = 'archived'
}

export type TMemoryScope = {
  scopeType: MemoryScopeTypeEnum | `${MemoryScopeTypeEnum}`
  scopeId: string
  audience?: MemoryAudienceEnum | `${MemoryAudienceEnum}`
  ownerUserId?: string
  parentScope?: TMemoryScope
}

export type TMemoryGovernanceAction = 'freeze' | 'unfreeze' | 'archive' | 'restore'

export type TMemorySource = 'manual' | 'summary' | 'tool' | 'import' | 'api'
export type TMemoryAudience = MemoryAudienceEnum | `${MemoryAudienceEnum}`

export const MEMORY_QA_PROMPT = `Summarize the experience of the above conversation and output a short question and answer.`
export const MEMORY_PROFILE_PROMPT = `Extract new user profile information from the above conversation in one short sentence. If no new information is available, return nothing.`

export type TMemory = {
  memoryId?: string
}
export type TMemoryUserProfile = TMemory & {
  profile: string
  context?: string
}
export type TMemoryQA = TMemory & {
  question: string
  answer: string
  context?: string
}

export type TXpertMemoryRecord = {
  id: string
  scopeType: MemoryScopeTypeEnum | `${MemoryScopeTypeEnum}`
  scopeId: string
  audience: TMemoryAudience
  ownerUserId?: string
  layerLabel?: string
  kind: LongTermMemoryTypeEnum
  status: MemoryRecordStatusEnum | `${MemoryRecordStatusEnum}`
  title: string
  value: TMemoryQA | TMemoryUserProfile
  contentPreview?: string
  source?: TMemorySource | string
  sourceRef?: string
  tags?: string[]
  createdAt?: string | Date
  updatedAt?: string | Date
  createdBy?: string | IUser
  updatedBy?: string | IUser
  score?: number
  metadata?: Record<string, any>
}

export interface IXpertMemoryRecord extends TXpertMemoryRecord {}

export type TMemoryFileEntry = {
  audience: TMemoryAudience
  ownerUserId?: string
  layerLabel: string
  path: string
  name: string
  isIndex: boolean
  kind?: LongTermMemoryTypeEnum
  memoryId?: string
  status?: MemoryRecordStatusEnum | `${MemoryRecordStatusEnum}`
  title?: string
  updatedAt?: string | Date
  content: string
  metadata?: Record<string, any>
}

export type TMemoryFileLayer = {
  audience: TMemoryAudience
  ownerUserId?: string
  layerLabel: string
  rootPath: string
  index: TMemoryFileEntry
  files: TMemoryFileEntry[]
}

export type TXpertMemoryFiles = {
  scopeType: MemoryScopeTypeEnum | `${MemoryScopeTypeEnum}`
  scopeId: string
  layers: TMemoryFileLayer[]
}
