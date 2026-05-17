import { inject } from '@angular/core'
import { upperFirst } from 'lodash-es'
import type { ChatKitEventHandlers } from '@xpert-ai/chatkit-angular'
import type { ChatKitEvents } from '@xpert-ai/chatkit-types'
import { letterStartSUID, OrderTypeEnum, WorkflowNodeTypeEnum, XpertAPIService } from '../../@core'

type EventDetail<T> = T extends CustomEvent<infer Detail> ? Detail : never

export type ChatKitEffectEvent = Parameters<NonNullable<ChatKitEventHandlers['onEffect']>>[0] &
  EventDetail<ChatKitEvents['chatkit.effect']>

export function getChatKitEffectData(event: ChatKitEffectEvent): Record<string, unknown> | null {
  if (event.data && typeof event.data === 'object' && !Array.isArray(event.data)) {
    return event.data
  }

  return null
}

export function getChatKitEffectXpertId(event: ChatKitEffectEvent): string | null {
  const data = getChatKitEffectData(event)
  const xpertId = data?.['xpertId']

  return typeof xpertId === 'string' && xpertId.trim() ? xpertId.trim() : null
}

export type ChatKitPromptWorkflowEffect = {
  workspaceId: string
  workflowId: string | null
  key: string | null
  operation: 'created' | 'updated' | 'deleted' | null
}

export function getChatKitPromptWorkflowEffect(event: ChatKitEffectEvent): ChatKitPromptWorkflowEffect | null {
  const data = getChatKitEffectData(event)
  const workspaceId = data?.['workspaceId']
  if (typeof workspaceId !== 'string' || !workspaceId.trim()) {
    return null
  }

  const workflowId = data?.['workflowId']
  const key = data?.['key']
  const operation = data?.['operation']

  return {
    workspaceId: workspaceId.trim(),
    workflowId: typeof workflowId === 'string' && workflowId.trim() ? workflowId.trim() : null,
    key: typeof key === 'string' && key.trim() ? key.trim() : null,
    operation: operation === 'created' || operation === 'updated' || operation === 'deleted' ? operation : null
  }
}

export type ChatKitWorkspaceSkillEffect = {
  workspaceId: string
  skillId: string | null
  operation: 'created' | 'deleted' | null
}

export function getChatKitWorkspaceSkillEffect(event: ChatKitEffectEvent): ChatKitWorkspaceSkillEffect | null {
  const data = getChatKitEffectData(event)
  const workspaceId = data?.['workspaceId']
  if (typeof workspaceId !== 'string' || !workspaceId.trim()) {
    return null
  }

  const skillId = data?.['skillId']
  const operation = data?.['operation']
  return {
    workspaceId: workspaceId.trim(),
    skillId: typeof skillId === 'string' && skillId.trim() ? skillId.trim() : null,
    operation: operation === 'created' || operation === 'deleted' ? operation : null
  }
}

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
        'knowledgebase'
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
