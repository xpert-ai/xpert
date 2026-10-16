// Local visual fixtures only. No HTTP client, credentials or business writes are used.
import { signal } from '@angular/core'
import { of } from 'rxjs'
import type { AssistantSharingState, AssistantSharingUser } from '@xpert-ai/contracts'
export const organization = signal('preview-organization')
export const notice = signal('')
const members: AssistantSharingUser[] = [
  { id: 'chen', firstName: '陈明', email: 'chenming@example.test' },
  { id: 'li', firstName: '李然', email: 'liran@example.test' },
  { id: 'wang', firstName: '王晓', email: 'wangxiao@example.test' },
  { id: 'zhao', firstName: '赵琳', email: 'zhaolin@example.test' }
]
const groupRows = [
  { id: 'release', name: '新品发布会议组', description: '星澜新品发布会议组' },
  { id: 'product', name: '产品团队', description: '产品规划与交付' }
]
const mode = new URLSearchParams(location.search).get('mode')
let current: AssistantSharingState = {
  capabilities: {
    canViewAccess: true,
    canManageAccess: mode !== 'readonly',
    canUseGroups: mode === 'groups',
    canManageGroups: mode === 'groups'
  },
  organization: { id: 'preview-organization', name: '南京元数信息技术' },
  users: members.slice(0, 2),
  groups: mode === 'groups' ? [groupRows[0]] : [],
  groupRevision: 'preview',
  inherited: {
    creator: { id: 'owner', firstName: 'wangtiwen', email: 'wangtiwen@example.test' },
    workspace: { id: 'workspace', name: 'ClawXpert 工作空间', organizationShared: false, memberCount: 4 }
  }
}
export class XpertComponent {
  readonly xpertId = signal('preview-assistant')
  readonly xpert = signal({ id: 'preview-assistant', name: 'ClawXpert' })
}
export const injectOrganizationId = () => organization
export const injectToastr = () => ({
  success: (_key: string) => notice.set('分享已更新'),
  error: (error: string) => notice.set(error)
})
export const getErrorMessage = (error: Error) => error.message
export const injectXpertAPI = () => ({
  getSharing: (_id: string) => of(current),
  getShareCandidates: (_id: string, search: string, _skip: number) =>
    of({ items: members.filter((user) => `${user.firstName} ${user.email}`.includes(search)), total: members.length }),
  getShareGroupCandidates: (_id: string, search: string, _skip: number) =>
    of({ items: groupRows.filter((group) => group.name.includes(search)), total: groupRows.length }),
  shareUsers: (_id: string, ids: string[]) => {
    current = {
      ...current,
      users: [
        ...new Map(
          [...current.users, ...members.filter((user) => ids.includes(user.id))].map((user) => [user.id, user])
        ).values()
      ]
    }
    return of(current)
  },
  revokeShare: (_id: string, id: string) => {
    current = { ...current, users: current.users.filter((user) => user.id !== id) }
    return of(current)
  },
  saveShareGroups: (_id: string, ids: string[], _revision: string) => {
    current = { ...current, groups: groupRows.filter((group) => ids.includes(group.id)) }
    return of(current)
  }
})
