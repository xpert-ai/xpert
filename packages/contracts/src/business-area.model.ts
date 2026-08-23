import type { IBasePerTenantAndOrganizationEntityModel } from './base-entity.model'

/**
 * Canonical business-area master data owned by xpert-pro.
 * Consumers may attach their own usage records by `id`, but must not duplicate
 * this entity as another source of truth.
 */
export interface IBusinessArea extends IBasePerTenantAndOrganizationEntityModel {
  type?: BusinessType
  name?: string
  parentId?: string | null
  level?: number
  children?: IBusinessArea[]
}

export enum BusinessType {
  SEMANTIC_MODEL = 'SEMANTIC_MODEL',
  STORY = 'STORY',
  INDICATOR = 'INDICATOR'
}

export interface CreateBusinessAreaInput {
  name: string
  parentId?: string | null
}

export type UpdateBusinessAreaInput = Partial<CreateBusinessAreaInput>
