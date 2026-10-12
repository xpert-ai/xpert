import type { IAssistantBinding } from './assistant-binding.model'
import type { IXpert } from './xpert.model'

export type ClawXpertRecoveryStatus = {
  status: 'ready' | 'missing' | 'binding_inaccessible' | 'dependency_unavailable' | 'initializing' | 'error'
  code:
    | 'ready'
    | 'binding_missing'
    | 'binding_inaccessible'
    | 'model_required'
    | 'initialization_running'
    | 'initialization_failed'
    | 'personal_workspace_unavailable'
  checkedAt: string
  binding: IAssistantBinding | null
  candidates: Array<Pick<IXpert, 'id' | 'name' | 'title' | 'workspaceId'>>
  canRecover: boolean
}
