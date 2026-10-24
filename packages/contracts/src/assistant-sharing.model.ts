import { IUser } from './user.model'

export type AssistantSharingUser = Pick<IUser, 'id' | 'firstName' | 'lastName' | 'email' | 'username' | 'imageUrl'>
export type AssistantSharingGroup = { id: string; name: string; description?: string | null }
export type AssistantSharingCapabilities = {
  canViewAccess: boolean
  canManageAccess: boolean
  canUseGroups: boolean
  canManageGroups: boolean
}
export type AssistantSharingState = {
  capabilities: AssistantSharingCapabilities
  organization: { id: string; name: string }
  users: AssistantSharingUser[]
  groups: AssistantSharingGroup[]
  groupRevision: string
  inherited: {
    creator?: AssistantSharingUser
    workspace?: { id: string; name: string; organizationShared: boolean; memberCount: number }
  }
}
