import { IBasePerTenantEntityModel } from './base-entity.model'
import { IUser } from './user.model'

export interface IReferralCode extends IBasePerTenantEntityModel {
  code: string
  userId?: string | null
  user?: IUser | null
}

export interface IReferralRelation extends IBasePerTenantEntityModel {
  referrerUserId?: string | null
  referrerUser?: IUser | null
  referredUserId?: string | null
  referredUser?: IUser | null
  usedCode: string
  boundAt: Date
}

export interface IReferralAccountView {
  id?: string | null
  name?: string | null
  email?: string | null
  deleted: boolean
}

export interface IReferralRelationView {
  id: string
  referrer: IReferralAccountView
  referred: IReferralAccountView
  usedCode: string
  boundAt: Date
}

export interface IReferralCodeView {
  code: string
}

export interface IReferralRelationQuery {
  search?: string
  skip?: number
  take?: number
}
