import { IXpertRole } from '@metad/contracts'
import { getXpertRoleKey } from './types'
import { IRoleViewModel } from './role'

export function findXpertRole(roles: IXpertRole[], key: string): IRoleViewModel {
  let leader: IRoleViewModel = null
  for (const member of roles) {
    if (getXpertRoleKey(member) === key) {
      leader = member
    } else if (member.followers?.length) {
      leader = findXpertRole(member.followers, key)
    }

    if (leader) {
      return leader
    }
  }

  return leader
}

export function removeXpertRole(roles: IXpertRole[], key: string) {
  return roles?.filter((role) => {
    if (role.followers?.length) {
      role.followers = removeXpertRole(role.followers, key)
    }
    if (getXpertRoleKey(role) === key) {
      return false
    }
    return true
  })
}
