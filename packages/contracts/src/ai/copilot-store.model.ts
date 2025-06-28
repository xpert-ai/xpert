import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'

export interface ICopilotStore extends TCopilotStore, IBasePerTenantAndOrganizationEntityModel {}

export interface ICopilotStoreVector extends TCopilotStoreVector, IBasePerTenantAndOrganizationEntityModel {
}

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
}