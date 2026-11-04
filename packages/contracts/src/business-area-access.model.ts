import type { IBasePerTenantAndOrganizationEntityModel } from './base-entity.model'

export const BUSINESS_AREA_ACCESS_ROLES = ['consumer', 'publisher', 'domain_admin'] as const
export type TBusinessAreaRole = (typeof BUSINESS_AREA_ACCESS_ROLES)[number]
export type TBusinessAreaAction = 'view' | 'publish' | 'manage'
export type TBusinessAreaGrantSubject =
  | { subjectType: 'user'; userId: string; userGroupId?: never }
  | { subjectType: 'user_group'; userGroupId: string; userId?: never }
export type TBusinessAreaGrantInput = TBusinessAreaGrantSubject & { role: TBusinessAreaRole }

export interface IBusinessAreaAccessGrant extends IBasePerTenantAndOrganizationEntityModel {
  id: string
  createdAt: Date
  updatedAt: Date
  businessAreaId: string
  subjectType: 'user' | 'user_group'
  userId?: string | null
  userGroupId?: string | null
  role: TBusinessAreaRole
  subjectName?: string
}

export interface IBusinessAreaAccess {
  businessAreaId: string
  userId: string
  canView: boolean
  canPublish: boolean
  canManage: boolean
  sources: IBusinessAreaAccessGrant[]
  platformManagement: boolean
}

export interface IBusinessAreaCapabilities {
  view: string[]
  publish: string[]
  manage: string[]
}

export interface IBusinessAreaGrantCandidates {
  users: { id: string; name: string }[]
  groups: { id: string; name: string }[]
}

export function businessAreaRoleAllows(role: TBusinessAreaRole, action: TBusinessAreaAction): boolean {
  return action === 'view' || (action === 'publish' ? role !== 'consumer' : role === 'domain_admin')
}
