import { Dialog, DialogRef } from '@angular/cdk/dialog'
import { HttpErrorResponse } from '@angular/common/http'
import { Injectable, ViewContainerRef, inject, signal } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'
import { AssistantBindingScope, AssistantCode, type IAssistantBinding, type TXpertTeamDraft } from '@xpert-ai/contracts'
import { getErrorMessage } from '../types'
import { firstValueFrom, Subject, Subscription, takeUntil } from 'rxjs'
import {
  XpertSettingsLoaderComponent,
  type XpertSettingsLoaderData,
  type XpertSettingsLoadState
} from '../../@shared/xpert/assistant-settings/xpert-settings-loader.component'
import { isEqual } from 'lodash-es'
import { buildEditableXpertDraft } from '../../features/xpert/draft/editable-draft.util'
import { DraftSaveQueue } from '../../@shared/xpert/assistant-settings/draft-save-queue'
import type {
  XpertSettingsSection,
  XpertSettingsSaveMode,
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
  private dialogRef: DialogRef<unknown, XpertSettingsLoaderComponent> | null = null
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
    resolvedBinding?: IAssistantBinding | null,
    saveMode: XpertSettingsSaveMode = 'publish'
  ) {
    if (!id || this.opening || this.dialogRef) return
    this.opening = true
    const organizationId = this.store.organizationId
    const subscriptions = new Subscription()
    const state = signal<XpertSettingsLoadState>({ status: 'loading' })
    let disposed = false
    let loading = false
    let cancelLoad: Subject<void> | undefined
    let source: XpertSettingsSource | undefined
    let binding: IAssistantBinding | null = null
    const load = async () => {
      if (disposed || loading) return
      loading = true
      state.set({ status: 'loading' })
      const cancelled = new Subject<void>()
      cancelLoad = cancelled
      try {
        const [loadedSource, candidate, { XpertSettingsDialogComponent }] = await Promise.all([
          activeSource?.id === id && activeSource.draft()
            ? activeSource
            : this.loadSource(id, organizationId, cancelled),
          resolvedBinding === undefined
            ? firstValueFrom(
                this.bindings.get(AssistantCode.CLAWXPERT, AssistantBindingScope.USER).pipe(takeUntil(cancelled))
              )
            : resolvedBinding,
          import('../../@shared/xpert/assistant-settings/xpert-settings-dialog.component')
        ])
        if (disposed || organizationId !== this.store.organizationId) return
        source = loadedSource
        binding = candidate?.assistantId === id && candidate.enabled !== false ? candidate : null
        const requestedSection = section ?? this.sections.get(id) ?? 'general'
        state.set({
          status: 'ready',
          component: XpertSettingsDialogComponent,
          data: {
            source: loadedSource,
            saveMode,
            binding,
            organizationId,
            section: requestedSection === 'personalization' && !binding ? 'general' : requestedSection,
            selectSection: (value: XpertSettingsSection) => this.sections.set(id, value),
            publish:
              saveMode === 'draft'
                ? undefined
                : async () => {
                    if (organizationId !== this.store.organizationId)
                      throw new Error(this.translate.instant('XP.AssistantSettings.BindingChanged'))
                    const latest = await firstValueFrom(this.api.getTeam(id))
                    if (organizationId !== this.store.organizationId)
                      throw new Error(this.translate.instant('XP.AssistantSettings.BindingChanged'))
                    await firstValueFrom(
                      this.api.publish(id, false, {
                        environmentId: latest.environmentId ?? null,
                        releaseNotes: this.translate.instant('XP.XpertSettings.PublishReleaseNotes')
                      })
                    )
                    // Publication replaces agent timestamps and clears the server draft. Rebase before the next edit.
                    await loadedSource.reload?.()
                  }
          }
        })
      } catch (error) {
        if (!disposed && organizationId === this.store.organizationId) {
          state.set({
            status: 'error',
            message:
              error instanceof HttpErrorResponse && error.status === 0
                ? this.translate.instant('XP.XpertSettings.NetworkError')
                : getErrorMessage(error)
          })
        }
      } finally {
        cancelled.next()
        cancelled.complete()
        loading = false
      }
    }
    try {
      const ref = this.dialog.open<unknown, XpertSettingsLoaderData, XpertSettingsLoaderComponent>(
        XpertSettingsLoaderComponent,
        {
          viewContainerRef,
          backdropClass: 'backdrop-blur-xs-black',
          panelClass: 'xp-overlay-pane-dialog',
          maxWidth: 'calc(100vw - 32px)',
          disableClose: true,
          ariaLabel: this.translate.instant('XP.XpertSettings.Title'),
          data: { state, retry: () => void load() }
        }
      )
      this.dialogRef = ref
      const closed = firstValueFrom(ref.closed)
      subscriptions.add(
        ref.closed.subscribe(() => {
          disposed = true
          cancelLoad?.next()
        })
      )
      subscriptions.add(
        this.store.selectOrganizationId().subscribe((current) => {
          if (current !== organizationId) ref.close()
        })
      )
      subscriptions.add(
        this.bindings.changes$.subscribe((change) => {
          if (
            change.code === AssistantCode.CLAWXPERT &&
            change.scope === AssistantBindingScope.USER &&
            (state().status !== 'ready' || binding)
          )
            ref.close()
        })
      )
      void load()
      await closed
      return source?.draft()
    } catch (error) {
      this.toastr.error(getErrorMessage(error))
    } finally {
      disposed = true
      cancelLoad?.next()
      subscriptions.unsubscribe()
      this.dialogRef = null
      this.opening = false
    }
  }

  private async loadSource(
    id: string,
    organizationId: string | null,
    cancelled: Subject<void>
  ): Promise<XpertSettingsSource> {
    const team = await firstValueFrom(
      this.api
        .getTeam(id, {
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
        .pipe(takeUntil(cancelled))
    )
    const draft = signal(buildEditableXpertDraft(team))
    let savedDraft = structuredClone(draft())
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
        if (this.store.organizationId === organizationId && !unsaved() && !saving() && draft() === before) {
          draft.set(buildEditableXpertDraft(latest))
          savedDraft = structuredClone(draft())
        }
      },
      discard: () => {
        if (saving()) return
        draft.set(structuredClone(savedDraft))
        unsaved.set(false)
        error.set(null)
      },
      update: (change) => {
        if (this.store.organizationId !== organizationId) return
        draft.update(change)
        unsaved.set(!isEqual(draft(), savedDraft))
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
          savedDraft = snapshot
          unsaved.set(!isEqual(snapshot, draft()))
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
