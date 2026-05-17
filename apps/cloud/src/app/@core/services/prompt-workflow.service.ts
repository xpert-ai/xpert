import { inject, Injectable } from '@angular/core'
import { API_PROMPT_WORKFLOW } from '../constants/app.constants'
import { IPromptWorkflow, IXpert, TPromptWorkflow, TXpertCommandProfile } from '../types'
import { XpertWorkspaceBaseCrudService } from './xpert-workspace.service'

export type TPromptWorkflowSkillCommandExport = {
  name: string
  label?: string
  description?: string
  icon?: unknown
  category?: string
  aliases?: string[]
  argsHint?: string
  kind: 'prompt_workflow'
  workflow: {
    type: 'prompt_workflow'
    name: string
    label?: string
    description?: string
    tags?: string[]
  }
  action: {
    type: 'submit_prompt'
    template: string
    runtimeCapabilities?: unknown
  }
}

@Injectable({ providedIn: 'root' })
export class PromptWorkflowAPIService extends XpertWorkspaceBaseCrudService<IPromptWorkflow> {
  constructor() {
    super(API_PROMPT_WORKFLOW)
  }

  createInWorkspace(workspaceId: string, body: Partial<TPromptWorkflow>) {
    return this.httpClient.post<IPromptWorkflow>(`${this.apiBaseUrl}/workspace/${workspaceId}`, body)
  }

  updateInWorkspace(workspaceId: string, id: string, body: Partial<TPromptWorkflow>) {
    return this.httpClient.put<IPromptWorkflow>(`${this.apiBaseUrl}/workspace/${workspaceId}/${id}`, body)
  }

  archiveInWorkspace(workspaceId: string, id: string) {
    return this.httpClient.post<IPromptWorkflow>(`${this.apiBaseUrl}/workspace/${workspaceId}/${id}/archive`, {})
  }

  duplicateInWorkspace(workspaceId: string, id: string) {
    return this.httpClient.post<IPromptWorkflow>(`${this.apiBaseUrl}/workspace/${workspaceId}/${id}/duplicate`, {})
  }

  getUsage(workspaceId: string, id: string) {
    return this.httpClient.get<Array<Pick<IXpert, 'id' | 'name' | 'title' | 'version' | 'latest' | 'publishAt'>>>(
      `${this.apiBaseUrl}/workspace/${workspaceId}/${id}/usage`
    )
  }

  validateCommandProfile(workspaceId: string, profile: TXpertCommandProfile) {
    return this.httpClient.post<TXpertCommandProfile>(
      `${this.apiBaseUrl}/workspace/${workspaceId}/validate-profile`,
      profile
    )
  }

  exportSkillCommand(
    workflow: Pick<
      IPromptWorkflow,
      | 'name'
      | 'label'
      | 'description'
      | 'icon'
      | 'category'
      | 'aliases'
      | 'argsHint'
      | 'template'
      | 'tags'
      | 'runtimeCapabilities'
    >
  ): TPromptWorkflowSkillCommandExport {
    return {
      name: workflow.name,
      label: workflow.label,
      description: workflow.description,
      icon: workflow.icon,
      category: workflow.category ?? 'prompt_workflow',
      aliases: workflow.aliases,
      argsHint: workflow.argsHint,
      kind: 'prompt_workflow',
      workflow: {
        type: 'prompt_workflow',
        name: workflow.name,
        label: workflow.label,
        description: workflow.description,
        tags: workflow.tags
      },
      action: {
        type: 'submit_prompt',
        template: workflow.template,
        ...(workflow.runtimeCapabilities ? { runtimeCapabilities: workflow.runtimeCapabilities } : {})
      }
    }
  }
}

export function injectPromptWorkflowAPI() {
  return inject(PromptWorkflowAPIService)
}
