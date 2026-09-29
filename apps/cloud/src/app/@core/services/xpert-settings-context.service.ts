import { computed, inject, Injectable, signal } from '@angular/core'
import { DIALOG_DATA } from '@angular/cdk/dialog'
import { toSignal } from '@angular/core/rxjs-interop'
import { firstValueFrom } from 'rxjs'
import { Store } from '../state'
import { AssistantBindingService } from './assistant-binding.service'
import {
  CHAT_WORKFLOW_TRIGGER_PROVIDER,
  readTriggerEditorItemsFromDraft,
  upsertTriggerEditorItemsIntoDraft,
  XpertDraftTriggerEditorItem
} from '../../features/xpert/draft'
import type { AssistantSettingsContext } from '../../@shared/xpert/assistant-settings/assistant-settings-context'
import type { XpertSettingsDialogData } from '../../@shared/xpert/assistant-settings/xpert-settings.types'

@Injectable()
export class XpertSettingsContextService implements AssistantSettingsContext {
  private readonly data = inject<XpertSettingsDialogData>(DIALOG_DATA)
  private readonly source = this.data.source
  private readonly store = inject(Store)
  private readonly bindings = inject(AssistantBindingService)
  private readonly initialOrganizationId = this.data.organizationId ?? this.store.organizationId
  readonly organizationId = toSignal(this.store.selectOrganizationId(), { initialValue: this.store.organizationId })
  readonly viewState = computed(() => (this.organizationId() === this.initialOrganizationId ? 'ready' : 'error'))
  readonly xpertId = computed(() => (this.viewState() === 'ready' ? this.source.id : null))
  readonly currentWorkspaceId = computed(() => this.source.draft().team.workspaceId ?? null)
  readonly resolvedPreference = computed(() => (this.viewState() === 'ready' ? (this.data.binding ?? null) : null))
  readonly loading = signal(false)
  readonly savingUserPreference = signal(false)
  readonly loadingTriggerDraft = signal(false)
  readonly savingTriggerDraft = this.source.saving
  readonly triggerDraftErrorMessage = this.source.error
  readonly triggerEditorItems = computed(() =>
    readTriggerEditorItemsFromDraft(this.source.draft(), [CHAT_WORKFLOW_TRIGGER_PROVIDER])
  )

  async saveUserPreference(input: { soul: string; profile: string }) {
    const binding = this.resolvedPreference()
    if (!binding || this.savingUserPreference()) return null
    this.savingUserPreference.set(true)
    try {
      const current = await firstValueFrom(this.bindings.get(binding.code, binding.scope))
      if (
        this.viewState() !== 'ready' ||
        !current ||
        current.id !== binding.id ||
        current.assistantId !== this.source.id ||
        current.enabled === false
      )
        return null
      return await firstValueFrom(this.bindings.upsertPreference(binding.code, { scope: binding.scope, ...input }))
    } finally {
      this.savingUserPreference.set(false)
    }
  }

  async saveTriggerDraft(items: XpertDraftTriggerEditorItem[]) {
    if (this.viewState() !== 'ready' || this.source.saving()) return null
    this.source.update((draft) => upsertTriggerEditorItemsIntoDraft(draft, items))
    await this.source.save()
    return this.source.draft()
  }

  async reloadTriggerDraft() {
    if (!this.source.reload || this.source.unsaved() || this.source.saving()) return
    this.loadingTriggerDraft.set(true)
    try {
      await this.source.reload()
    } finally {
      this.loadingTriggerDraft.set(false)
    }
  }
}
