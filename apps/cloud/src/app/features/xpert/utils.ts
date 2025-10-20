import { inject } from '@angular/core'
import { upperFirst } from 'lodash-es'
import { letterStartSUID, OrderTypeEnum, WorkflowNodeTypeEnum, XpertAPIService } from '../../@core'

export function injectGetXpertTeam() {
  const xpertService = inject(XpertAPIService)

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
        'copilotModel',
        'knowledgebase',
      ]
    })
  }
}

export function injectGetXpertsByWorkspace() {
  const xpertService = inject(XpertAPIService)

  return (workspace: string) => {
    return xpertService.getAllByWorkspace(
      workspace,
      { where: { latest: true }, order: { updatedAt: OrderTypeEnum.DESC } },
      true
    )
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

export function genXpertClassifierKey() {
  return letterStartSUID('Classifier_')
}

export function genXpertKnowledgeKey() {
  return letterStartSUID('Knowledge_')
}

export function genXpertCodeKey() {
  return letterStartSUID('Code_')
}

export function genXpertTemplateKey() {
  return letterStartSUID('Template_')
}

export function genXpertAssignerKey() {
  return letterStartSUID('Assigner_')
}

export function genXpertHttpKey() {
  return letterStartSUID('Http_')
}

export function genXpertSubflowKey() {
  return letterStartSUID('Subflow_')
}

export function genXpertToolKey() {
  return letterStartSUID('Tool_')
}

export function genXpertAgentToolKey() {
  return letterStartSUID('AgentTool_')
}
export function genXpertTaskKey() {
  return letterStartSUID('Task_')
}

export function genXpertNoteKey() {
  return letterStartSUID('Note_')
}

export function genWorkflowKey(type: WorkflowNodeTypeEnum) {
  switch (type) {
    case WorkflowNodeTypeEnum.IF_ELSE: {
      return genXpertRouterKey()
    }
    default: {
      return type ? letterStartSUID(upperFirst(type) + '_') : null
    }
  }
}
