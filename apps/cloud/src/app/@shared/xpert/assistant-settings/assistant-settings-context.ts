import { InjectionToken, Signal } from '@angular/core'
import type { IAssistantBinding, IAssistantBindingUserPreference, TXpertTeamDraft } from '@xpert-ai/contracts'
import type { XpertDraftTriggerEditorItem } from '../../../features/xpert/draft'

/** Optional adapter lets existing binding settings share the dialog's active draft. */
export interface AssistantSettingsContext {
  organizationId: Signal<string | null>
  xpertId: Signal<string | null>
  currentWorkspaceId: Signal<string | null>
  loading: Signal<boolean>
  viewState: Signal<'ready' | 'error'>
  resolvedPreference: Signal<IAssistantBinding | null>
  savingUserPreference: Signal<boolean>
  loadingTriggerDraft: Signal<boolean>
  savingTriggerDraft: Signal<boolean>
  triggerDraftErrorMessage: Signal<string | null>
  triggerEditorItems: Signal<XpertDraftTriggerEditorItem[]>
  saveUserPreference(input: { soul: string; profile: string }): Promise<IAssistantBindingUserPreference | null>
  saveTriggerDraft(items: XpertDraftTriggerEditorItem[]): Promise<TXpertTeamDraft | null>
  reloadTriggerDraft(): Promise<void>
}

export const ASSISTANT_SETTINGS_CONTEXT = new InjectionToken<AssistantSettingsContext>('Assistant settings context')
