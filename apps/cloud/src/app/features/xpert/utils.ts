import { inject } from '@angular/core'
import { letterStartSUID, OrderTypeEnum, XpertService } from '../../@core'

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
    return xpertService.getAllByWorkspace(workspace, { where: { latest: true }, order: {updatedAt: OrderTypeEnum.DESC} }, true)
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

export function genXpertAnswerKey() {
  return letterStartSUID('Answer_')
}

export function genXpertKnowledgeKey() {
  return letterStartSUID('Knowledge_')
}

export function genXpertCodeKey() {
  return letterStartSUID('Code_')
}

export function genXpertHttpKey() {
  return letterStartSUID('Http_')
}

export function genXpertSubflowKey() {
  return letterStartSUID('Subflow_')
}

export function genXpertNoteKey() {
  return letterStartSUID('Note_')
}