import { inject } from '@angular/core'
import { letterStartSUID, XpertService } from '../../@core'

export function injectGetXpertTeam() {
  const xpertService = inject(XpertService)

  return (id: string) => {
    return xpertService.getTeam(id, {
      relations: [
        'agent',
        'agent.copilotModel',
        'agents',
        'agents.copilotModel',
        'executors',
        'executors.agent',
        'executors.copilotModel',
        'copilotModel'
      ]
    })
  }
}

export function injectGetXpertsByWorkspace() {
  const xpertService = inject(XpertService)

  return (workspace: string) => {
    return xpertService.getAllByWorkspace(workspace, { where: { latest: true } }, true)
  }
}

export function genAgentKey() {
  return letterStartSUID('Agent_')
}

export function genXpertRouterKey() {
  return letterStartSUID('Router_')
}

export function genXpertIteratingKey() {
  return letterStartSUID('Iterating_')
}

export function isAgentKey(key: string) {
  return key?.toLowerCase().startsWith('agent_')
}

export function isRouterKey(key: string) {
  return key?.toLowerCase().startsWith('router_')
}

export function isIteratingKey(key: string) {
  return key?.toLowerCase().startsWith('iterating_')
}

export function isWorkflowKey(key: string) {
  return isRouterKey(key) || isIteratingKey(key)
}