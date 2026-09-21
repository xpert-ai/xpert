import { Dialog, DialogRef } from '@angular/cdk/dialog'
import { Injectable, ViewContainerRef, inject, signal } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'
import { AssistantBindingScope, AssistantCode, type IAssistantBinding, type TXpertTeamDraft } from '@xpert-ai/contracts'
import { getErrorMessage } from '../types'
import type { XpertSettingsDialogComponent } from '../../@shared/xpert/assistant-settings/xpert-settings-dialog.component'
import { firstValueFrom, Subscription } from 'rxjs'
import { isEqual } from 'lodash-es'
import { buildEditableXpertDraft } from '../../features/xpert/draft/editable-draft.util'
import { DraftSaveQueue } from '../../@shared/xpert/assistant-settings/draft-save-queue'
import type {
  XpertSettingsSection,
  XpertSettingsSource
} from '../../@shared/xpert/assistant-settings/xpert-settings.types'
import { XpertAPIService } from './xpert.service'
import { ToastrService } from './toastr.service'
import { AssistantBindingService } from './assistant-binding.service'
import { Store } from '../state'

@Injectable({ providedIn: 'root' })
export class XpertSettingsService {
  private readonly bindings = inject(AssistantBindingService)
  private readonly store = inject(Store)
  private readonly dialog = inject(Dialog)
  private readonly api = inject(XpertAPIService)
  private readonly translate = inject(TranslateService)
  private readonly toastr = inject(ToastrService)
  private dialogRef: DialogRef<unknown, XpertSettingsDialogComponent> | null = null
  private opening = false
  private readonly sections = new Map<string, XpertSettingsSection>()

  async openBoundAssistant(viewContainerRef: ViewContainerRef, section: XpertSettingsSection = 'statistics') {
    if (this.opening || this.dialogRef) return
    const organizationId = this.store.organizationId
    try {
      const binding = await firstValueFrom(this.bindings.get(AssistantCode.CLAWXPERT, AssistantBindingScope.USER))
      if (organizationId !== this.store.organizationId) return
      if (!binding?.assistantId || binding.enabled === false) {
        this.toastr.error(this.translate.instant('XP.AssistantSettings.BindingRequired'))
        return
      }
      return await this.open(viewContainerRef, binding.assistantId, section, undefined, binding)
    } catch (error) {
      this.toastr.error(getErrorMessage(error))
    }
  }

  async open(
    viewContainerRef: ViewContainerRef,
    id: string,
    section?: XpertSettingsSection,
    activeSource?: XpertSettingsSource,
    resolvedBinding?: IAssistantBinding | null
  ) {
    if (!id || this.opening || this.dialogRef) return
    this.opening = true
    const organizationId = this.store.organizationId
    const subscriptions = new Subscription()
    try {
      const source =
        activeSource?.id === id && activeSource.draft() ? activeSource : await this.loadSource(id, organizationId)
      const candidate =
        resolvedBinding === undefined
          ? await firstValueFrom(this.bindings.get(AssistantCode.CLAWXPERT, AssistantBindingScope.USER)).catch(
              () => null
            )
          : resolvedBinding
      const binding = candidate?.assistantId === id && candidate.enabled !== false ? candidate : null
      if (organizationId !== this.store.organizationId) return
      const requestedSection = section ?? this.sections.get(id) ?? 'general'
      const { XpertSettingsDialogComponent } =
        await import('../../@shared/xpert/assistant-settings/xpert-settings-dialog.component')
      if (organizationId !== this.store.organizationId) return
      this.dialogRef = this.dialog.open(XpertSettingsDialogComponent, {
        viewContainerRef,
        backdropClass: 'backdrop-blur-xs-black',
        panelClass: ['xp-overlay-pane-dialog', 'xp-overlay-pane-assistant-settings'],
        disableClose: true,
        ariaLabel: this.translate.instant('XP.XpertSettings.Title'),
        data: {
          source,
          binding,
          organizationId,
          section: requestedSection === 'personalization' && !binding ? 'general' : requestedSection,
          selectSection: (value: XpertSettingsSection) => this.sections.set(id, value)
        }
      })
      const closed = firstValueFrom(this.dialogRef.closed)
      subscriptions.add(
        this.store.selectOrganizationId().subscribe((current) => {
          if (current !== organizationId) this.dialogRef?.close()
        })
      )
      subscriptions.add(
        this.bindings.changes$.subscribe((change) => {
          if (binding && change.code === binding.code && change.scope === binding.scope) this.dialogRef?.close()
        })
      )
      await closed
      return source.draft()
    } catch (error) {
      this.toastr.error(getErrorMessage(error))
    } finally {
      subscriptions.unsubscribe()
      this.dialogRef = null
      this.opening = false
    }
  }

  private async loadSource(id: string, organizationId: string | null): Promise<XpertSettingsSource> {
    const team = await firstValueFrom(
      this.api.getTeam(id, {
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
    )
    const draft = signal(buildEditableXpertDraft(team))
    const saving = signal(false),
      unsaved = signal(false),
      error = signal<string | null>(null)
    const queue = new DraftSaveQueue<TXpertTeamDraft>()
    let pending = 0
    return {
      id,
      draft,
      saving,
      unsaved,
      error,
      workspaceDataScope: team.workspaceDataScope ?? 'shared',
      reload: async () => {
        const before = draft()
        const latest = await firstValueFrom(this.api.getTeam(id))
        if (this.store.organizationId === organizationId && !unsaved() && !saving() && draft() === before)
          draft.set(buildEditableXpertDraft(latest))
      },
      update: (change) => {
        if (this.store.organizationId !== organizationId) return
        draft.update(change)
        unsaved.set(true)
      },
      save: async () => {
        const snapshot = structuredClone(draft())
        pending++
        saving.set(true)
        error.set(null)
        try {
          await queue.save(snapshot, (value) => {
            if (this.store.organizationId !== organizationId)
              throw new Error(this.translate.instant('XP.AssistantSettings.BindingChanged'))
            return firstValueFrom(this.api.saveDraft(id, value))
          })
          if (isEqual(snapshot, draft())) unsaved.set(false)
        } catch (cause) {
          error.set(getErrorMessage(cause))
          throw cause
        } finally {
          pending--
          saving.set(pending > 0)
        }
      }
    }
  }
}
