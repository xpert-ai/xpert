import { IXpert } from '@metad/contracts'

export const Icon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bot-icon lucide-bot"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>`
export type AuthoringAssistantMode = 'workspace-create' | 'studio-agent-edit'

export type AuthoringToolName = 'newXpert' | 'editXpert'

export type AssistantDraftMutationResult = {
  status: 'applied' | 'rejected' | 'conflict'
  toolName: AuthoringToolName
  summary: string
  syncMode: 'none' | 'refresh'
  conflictType: 'unsaved-local' | 'stale-server' | null
  requiresRefresh: boolean
  committedDraftHash: string | null
  updatedDraftFragment: Record<string, unknown> | null
  warnings: string[]
}

export type AuthoringAssistantRequestContext = {
  mode?: AuthoringAssistantMode
  workspaceId?: string
  env?: Record<string, unknown>
  targetXpertId?: string
  unsaved?: boolean
  clientDraftHash?: string
}

export type NewXpertPayload = {
  userIntent: string
  templateId?: string
  xpertName?: string
}

export type EditXpertPayload = {
  name?: string
  description?: string
  avatar?: IXpert['avatar']
  prompt?: string
  model?: IXpert['copilotModel']
  starters?: string[]
}

export type AuthoringAssistantEffect = {
  name: 'navigate_to_studio' | 'refresh_studio'
  data: {
    xpertId: string
  }
}
