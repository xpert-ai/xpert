import type { Signal } from '@angular/core'
import type { IAssistantBinding, TXpertTeamDraft, XpertWorkspaceDataScope } from '@xpert-ai/contracts'

export type XpertDraftSettingsSection =
  | 'general'
  | 'models'
  | 'conversation'
  | 'workbench'
  | 'files'
  | 'speech'
  | 'memory'
  | 'runtime'

export type XpertSettingsSection =
  | XpertDraftSettingsSection
  | 'personalization'
  | 'assistant'
  | 'statistics'
  | 'externalExperts'
  | 'subagents'
  | 'skills'
  | 'middleware'

export const XPERT_DRAFT_SETTINGS_SECTIONS: ReadonlyArray<{
  key: XpertDraftSettingsSection
  group: 'Basic' | 'Experience' | 'Execution'
  icon: string
}> = [
  { key: 'general', group: 'Basic', icon: 'ri-settings-3-line' },
  { key: 'models', group: 'Basic', icon: 'ri-box-3-line' },
  { key: 'conversation', group: 'Experience', icon: 'ri-chat-1-line' },
  { key: 'workbench', group: 'Experience', icon: 'ri-layout-2-line' },
  { key: 'files', group: 'Experience', icon: 'ri-attachment-2' },
  { key: 'speech', group: 'Experience', icon: 'ri-mic-line' },
  { key: 'memory', group: 'Execution', icon: 'ri-database-2-line' },
  { key: 'runtime', group: 'Execution', icon: 'ri-play-line' }
]

export const XPERT_SETTINGS_SECTIONS = [
  ...XPERT_DRAFT_SETTINGS_SECTIONS,
  { key: 'externalExperts', group: 'Execution', icon: 'ri-team-line' },
  { key: 'subagents', group: 'Execution', icon: 'ri-node-tree' },
  { key: 'skills', group: 'Execution', icon: 'ri-lightbulb-line' },
  { key: 'middleware', group: 'Execution', icon: 'ri-puzzle-line' },
  { key: 'personalization', group: 'Experience', icon: 'ri-sparkling-line' },
  { key: 'assistant', group: 'Execution', icon: 'ri-robot-2-line' },
  { key: 'statistics', group: 'Execution', icon: 'ri-bar-chart-box-line' }
] as const

/** The dialog edits the active draft; it must never create a second Studio store. */
export interface XpertSettingsSource {
  id: string
  draft: Signal<TXpertTeamDraft>
  workspaceDataScope: XpertWorkspaceDataScope
  saving: Signal<boolean>
  unsaved: Signal<boolean>
  error: Signal<string | null>
  update: (change: (draft: TXpertTeamDraft) => TXpertTeamDraft) => void
  save: () => Promise<void>
  reload?: () => Promise<void>
}

export interface XpertSettingsDialogData {
  source: XpertSettingsSource
  binding?: IAssistantBinding | null
  organizationId?: string | null
  section: XpertSettingsSection
  selectSection: (section: XpertSettingsSection) => void
}
