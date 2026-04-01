import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { environment } from '@cloud/environments/environment'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ChatKit } from '@xpert-ai/chatkit-angular'
import { firstValueFrom, startWith } from 'rxjs'
import {
  AssistantBindingScope,
  AssistantBindingService,
  AssistantCode,
  IAssistantBinding,
  IPagination,
  IXpert,
  Store,
  ToastrService,
  getErrorMessage
} from '../../../@core'
import {
  injectHostedAssistantChatkitControl,
  sanitizeAssistantFrameUrl
} from '../../assistant/assistant-chatkit.runtime'
import { getAssistantRegistryItem } from '../../assistant/assistant.registry'

type ClawXpertViewState = 'organization-required' | 'wizard' | 'ready' | 'error'

@Component({
  standalone: true,
  selector: 'pac-clawxpert',
  imports: [CommonModule, ReactiveFormsModule, RouterModule, TranslateModule, ChatKit],
  template: `
    <div class="flex h-full flex-col gap-4 overflow-hidden p-4 lg:grid lg:grid-cols-[minmax(0,1fr)_460px]">
      <section class="order-2 flex min-h-0 flex-col overflow-hidden rounded-3xl lg:order-1">
        <div class="border-b border-divider-regular px-5 py-4">
          <div class="text-xs uppercase tracking-[0.24em] text-text-tertiary">
            {{ definition.labelKey | translate: { Default: definition.defaultLabel } }}
          </div>
          <div class="mt-2 text-2xl font-semibold text-text-primary">
            {{ definition.titleKey | translate: { Default: definition.defaultTitle } }}
          </div>
          <p class="mt-2 max-w-2xl text-sm text-text-secondary">
            {{ definition.descriptionKey | translate: { Default: definition.defaultDescription } }}
          </p>
        </div>

        <div class="grid flex-1 gap-4 overflow-auto p-4 md:grid-cols-2">
          <article class="rounded-2xl border border-divider-regular bg-components-card-bg p-5 shadow-sm">
            <div class="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-text-tertiary">
              <i class="ri-user-star-line text-base"></i>
              <span>{{ 'PAC.Chat.ClawXpert.Personal' | translate: { Default: 'Personal Binding' } }}</span>
            </div>
            <div class="mt-4 text-lg font-semibold text-text-primary">
              @if (resolvedPreference()) {
                {{ currentXpertLabel() }}
              } @else {
                {{ 'PAC.Chat.ClawXpert.NotConfigured' | translate: { Default: 'Not configured yet' } }}
              }
            </div>
            <p class="mt-2 text-sm text-text-secondary">
              @if (organizationId()) {
                {{
                  'PAC.Chat.ClawXpert.ScopeDesc'
                    | translate
                      : { Default: 'Your ClawXpert binding is stored per user and per organization.' }
                }}
              } @else {
                {{
                  'PAC.Chat.ClawXpert.ScopeRequired'
                    | translate
                      : { Default: 'Select an organization first to activate your ClawXpert workspace.' }
                }}
              }
            </p>
          </article>

          <article class="rounded-2xl border border-divider-regular bg-components-card-bg p-5 shadow-sm">
            <div class="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-text-tertiary">
              <i class="ri-links-line text-base"></i>
              <span>{{ 'PAC.Chat.ClawXpert.HowItWorks' | translate: { Default: 'How It Works' } }}</span>
            </div>
            <div class="mt-4 space-y-3 text-sm text-text-secondary">
              <div class="rounded-2xl border border-divider-regular bg-background-default-subtle px-4 py-3">
                {{ 'PAC.Chat.ClawXpert.StepSelect' | translate: { Default: 'Pick one published Xpert you can access.' } }}
              </div>
              <div class="rounded-2xl border border-divider-regular bg-background-default-subtle px-4 py-3">
                {{ 'PAC.Chat.ClawXpert.StepBind' | translate: { Default: 'ClawXpert stores that binding for your current organization.' } }}
              </div>
              <div class="rounded-2xl border border-divider-regular bg-background-default-subtle px-4 py-3">
                {{
                  'PAC.Chat.ClawXpert.StepChat'
                    | translate
                      : { Default: 'All future conversations on this page run against your selected assistant.' }
                }}
              </div>
            </div>
          </article>

          <article class="rounded-2xl border border-divider-regular bg-components-card-bg p-5 shadow-sm md:col-span-2">
            <div class="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-text-tertiary">
              <i class="ri-terminal-window-line text-base"></i>
              <span>{{ 'PAC.Chat.ClawXpert.Runtime' | translate: { Default: 'Runtime' } }}</span>
            </div>
            <div class="mt-4 grid gap-4 md:grid-cols-3">
              <div class="rounded-2xl border border-divider-regular bg-background-default-subtle px-4 py-3">
                <div class="text-xs uppercase tracking-[0.18em] text-text-tertiary">
                  {{ 'PAC.Chat.ClawXpert.Organization' | translate: { Default: 'Organization' } }}
                </div>
                <div class="mt-2 font-medium text-text-primary">{{ organizationId() || 'N/A' }}</div>
              </div>
              <div class="rounded-2xl border border-divider-regular bg-background-default-subtle px-4 py-3">
                <div class="text-xs uppercase tracking-[0.18em] text-text-tertiary">
                  {{ 'PAC.Chat.ClawXpert.AssistantId' | translate: { Default: 'Assistant ID' } }}
                </div>
                <div class="mt-2 break-all font-mono text-xs text-text-primary">
                  {{ resolvedPreference()?.assistantId || 'N/A' }}
                </div>
              </div>
              <div class="rounded-2xl border border-divider-regular bg-background-default-subtle px-4 py-3">
                <div class="text-xs uppercase tracking-[0.18em] text-text-tertiary">
                  {{ 'PAC.Chat.ClawXpert.Frame' | translate: { Default: 'ChatKit Frame' } }}
                </div>
                <div class="mt-2 break-all font-mono text-xs text-text-primary">
                  {{ chatkitFrameUrl() || 'N/A' }}
                </div>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section
        class="order-1 flex min-h-0 flex-col overflow-hidden rounded-3xl border border-divider-regular bg-components-card-bg shadow-sm lg:order-2"
      >
        <div class="flex items-start justify-between gap-4 border-b border-divider-regular px-5 py-4">
          <div>
            <div class="text-xs uppercase tracking-[0.24em] text-text-tertiary">
              {{ 'PAC.Chat.ClawXpert.Shell' | translate: { Default: 'ClawXpert Shell' } }}
            </div>
            <div class="mt-2 text-lg font-semibold text-text-primary">
              {{ definition.titleKey | translate: { Default: definition.defaultTitle } }}
            </div>
          </div>

          @if (organizationId() && !loading()) {
            <div class="flex items-center gap-2">
              @if (resolvedPreference() && viewState() === 'ready') {
                <button
                  type="button"
                  class="rounded-full border border-divider-regular px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-hover-bg"
                  (click)="openWizard()"
                >
                  {{ 'PAC.Chat.ClawXpert.Change' | translate: { Default: 'Change ClawXpert' } }}
                </button>
                <button
                  type="button"
                  class="rounded-full border border-divider-regular px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-hover-bg disabled:cursor-not-allowed disabled:opacity-60"
                  [disabled]="clearing()"
                  (click)="clearPreference()"
                >
                  {{ 'PAC.Chat.ClawXpert.Clear' | translate: { Default: 'Clear ClawXpert' } }}
                </button>
              } @else if (resolvedPreference() && viewState() === 'wizard') {
                <button
                  type="button"
                  class="rounded-full border border-divider-regular px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-hover-bg"
                  (click)="cancelWizard()"
                >
                  {{ 'PAC.ACTIONS.Cancel' | translate: { Default: 'Cancel' } }}
                </button>
              }
            </div>
          }
        </div>

        <div class="min-h-0 flex-1 p-3">
          @if (loading()) {
            <div class="flex h-full min-h-[32rem] items-center justify-center rounded-2xl bg-background-default-subtle px-6 text-sm text-text-secondary">
              {{ 'PAC.Chat.ClawXpert.Loading' | translate: { Default: 'Preparing ClawXpert…' } }}
            </div>
          } @else {
            @switch (viewState()) {
              @case ('organization-required') {
                <div class="flex h-full min-h-[32rem] flex-col items-center justify-center rounded-2xl border border-dashed border-divider-regular bg-background-default-subtle px-6 text-center">
                  <i class="ri-building-line text-3xl text-text-tertiary"></i>
                  <div class="mt-4 text-base font-medium text-text-primary">
                    {{
                      'PAC.Chat.ClawXpert.OrganizationRequired'
                        | translate
                          : { Default: 'Select an organization to use ClawXpert' }
                    }}
                  </div>
                  <div class="mt-2 max-w-sm text-sm text-text-secondary">
                    {{
                      'PAC.Chat.ClawXpert.OrganizationRequiredDesc'
                        | translate
                          : { Default: 'ClawXpert stores one assistant binding per user and per organization.' }
                    }}
                  </div>
                </div>
              }
              @case ('error') {
                <div class="flex h-full min-h-[32rem] flex-col items-center justify-center rounded-2xl border border-divider-regular bg-background-default-subtle px-6 text-center">
                  <i class="ri-error-warning-line text-3xl text-text-tertiary"></i>
                  <div class="mt-4 text-base font-medium text-text-primary">
                    {{ 'PAC.Chat.ClawXpert.LoadFailed' | translate: { Default: 'Failed to load ClawXpert.' } }}
                  </div>
                  <div class="mt-2 max-w-sm text-sm text-text-secondary">
                    {{ viewErrorMessage() }}
                  </div>
                </div>
              }
              @case ('ready') {
                <xpert-chatkit class="h-full min-h-[32rem]" [control]="control()!" />
              }
              @default {
                <div class="flex h-full min-h-[32rem] flex-col rounded-2xl border border-divider-regular bg-background-default-subtle p-5">
                  <div class="text-xs uppercase tracking-[0.24em] text-text-tertiary">
                    {{ 'PAC.Chat.ClawXpert.Wizard' | translate: { Default: 'Setup Wizard' } }}
                  </div>
                  <div class="mt-3 text-xl font-semibold text-text-primary">
                    {{
                      'PAC.Chat.ClawXpert.WizardTitle'
                        | translate
                          : { Default: 'Choose the published Xpert that should power your ClawXpert page.' }
                    }}
                  </div>
                  <p class="mt-2 max-w-lg text-sm text-text-secondary">
                    {{
                      'PAC.Chat.ClawXpert.WizardDesc'
                        | translate
                          : { Default: 'This page only needs one binding. You can change it later at any time.' }
                    }}
                  </p>

                  @if (orphanedPreference()) {
                    <div class="mt-4 rounded-2xl border border-divider-regular bg-components-card-bg px-4 py-3 text-sm text-text-secondary">
                      {{
                        'PAC.Chat.ClawXpert.BindingUnavailable'
                          | translate
                            : { Default: 'Your previous ClawXpert binding is no longer available. Please select another assistant.' }
                      }}
                    </div>
                  }

                  @if (availableXperts().length === 0) {
                    <div class="mt-6 flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-divider-regular bg-components-card-bg px-6 text-center">
                      <i class="ri-robot-line text-4xl text-text-tertiary"></i>
                      <div class="mt-4 text-base font-medium text-text-primary">
                        {{
                          'PAC.Chat.ClawXpert.NoAssistants'
                            | translate
                              : { Default: 'No published assistants are available yet' }
                        }}
                      </div>
                      <div class="mt-2 max-w-sm text-sm text-text-secondary">
                        {{
                          'PAC.Chat.ClawXpert.NoAssistantsDesc'
                            | translate
                              : { Default: 'Publish an Xpert that you can access, then come back and bind it to ClawXpert.' }
                        }}
                      </div>
                      <a
                        routerLink="/xpert/w"
                        class="mt-4 inline-flex items-center rounded-full border border-divider-regular px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-hover-bg"
                      >
                        {{ 'PAC.Chat.GotoWorkspace' | translate: { Default: 'Go to Workspace' } }}
                      </a>
                    </div>
                  } @else {
                    <form class="mt-5 flex min-h-0 flex-1 flex-col" [formGroup]="form">
                      <label class="grid gap-2">
                        <span class="text-sm text-text-secondary">
                          {{
                            'PAC.Chat.ClawXpert.SearchPlaceholder'
                              | translate
                                : { Default: 'Search your available assistants by title, name, slug, or id' }
                          }}
                        </span>
                        <input
                          class="rounded-2xl border border-divider-regular bg-components-card-bg px-3 py-2 text-sm text-text-primary outline-none"
                          [formControl]="searchControl"
                          type="text"
                        />
                      </label>

                      <div class="mt-4 min-h-0 flex-1 overflow-auto rounded-2xl border border-divider-regular bg-components-card-bg p-2">
                        @if (filteredXperts().length > 0) {
                          <div class="space-y-2">
                            @for (item of filteredXperts(); track item.id) {
                              <button
                                type="button"
                                class="w-full rounded-2xl border px-4 py-3 text-left transition-colors"
                                [class.border-divider-deep]="form.controls.assistantId.value === item.id"
                                [class.border-divider-regular]="form.controls.assistantId.value !== item.id"
                                [class.bg-hover-bg]="form.controls.assistantId.value === item.id"
                                [class.bg-components-card-bg]="form.controls.assistantId.value !== item.id"
                                [class.shadow-sm]="form.controls.assistantId.value === item.id"
                                [class.text-text-primary]="true"
                                (click)="selectXpert(item.id)"
                              >
                                <div class="font-medium">{{ getXpertLabel(item) }}</div>
                                <div class="mt-1 font-mono text-xs text-text-secondary">{{ item.id }}</div>
                              </button>
                            }
                          </div>
                        } @else {
                          <div class="flex h-full min-h-40 items-center justify-center px-4 text-center text-sm text-text-secondary">
                            {{
                              'PAC.Chat.ClawXpert.NoMatches'
                                | translate
                                  : { Default: 'No assistants match your current search.' }
                            }}
                          </div>
                        }
                      </div>

                      <div class="mt-4 flex items-center justify-end gap-2">
                        @if (resolvedPreference()) {
                          <button
                            type="button"
                            class="rounded-full border border-divider-regular px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-hover-bg"
                            (click)="cancelWizard()"
                          >
                            {{ 'PAC.ACTIONS.Cancel' | translate: { Default: 'Cancel' } }}
                          </button>
                        }
                        <button
                          type="button"
                          class="rounded-full border border-divider-regular px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-hover-bg disabled:cursor-not-allowed disabled:opacity-60"
                          [disabled]="form.invalid || saving()"
                          (click)="savePreference()"
                        >
                          {{ 'PAC.KEY_WORDS.Save' | translate: { Default: 'Save' } }}
                        </button>
                      </div>
                    </form>
                  }
                </div>
              }
            }
          }
        </div>
      </section>
    </div>
  `
})
export class ClawXpertComponent {
  #loadRequestId = 0

  readonly #assistantBindingService = inject(AssistantBindingService)
  readonly #store = inject(Store)
  readonly #formBuilder = inject(FormBuilder)
  readonly #toastr = inject(ToastrService)
  readonly #translate = inject(TranslateService)

  readonly definition = getAssistantRegistryItem(AssistantCode.CLAWXPERT)!
  readonly organizationId = toSignal(this.#store.selectOrganizationId(), {
    initialValue: this.#store.organizationId ?? null
  })
  readonly searchControl = this.#formBuilder.nonNullable.control('')
  readonly searchText = toSignal(this.searchControl.valueChanges.pipe(startWith(this.searchControl.value)), {
    initialValue: this.searchControl.value
  })
  readonly form = this.#formBuilder.nonNullable.group({
    assistantId: this.#formBuilder.nonNullable.control('', Validators.required)
  })
  readonly preference = signal<IAssistantBinding | null>(null)
  readonly availableXperts = signal<IXpert[]>([])
  readonly loading = signal(false)
  readonly saving = signal(false)
  readonly clearing = signal(false)
  readonly showWizard = signal(false)
  readonly errorMessage = signal<string | null>(null)
  readonly hasLoadedXperts = signal(false)
  readonly chatkitFrameUrl = computed(() => sanitizeAssistantFrameUrl(environment.CHATKIT_FRAME_URL))
  readonly filteredXperts = computed(() => {
    const searchText = this.searchText().trim().toLowerCase()
    if (!searchText) {
      return this.availableXperts()
    }

    return this.availableXperts().filter((xpert) =>
      [xpert.id, xpert.slug, xpert.name, xpert.title, xpert.titleCN]
        .filter((value): value is string => !!value)
        .some((value) => value.toLowerCase().includes(searchText))
    )
  })
  readonly resolvedPreference = computed(() => {
    const preference = this.preference()
    if (!preference) {
      return null
    }
    if (!this.hasLoadedXperts()) {
      return preference
    }

    return this.availableXperts().some((item) => item.id === preference.assistantId) ? preference : null
  })
  readonly orphanedPreference = computed(() => {
    return !!this.preference() && this.hasLoadedXperts() && !this.resolvedPreference()
  })
  readonly currentXpertLabel = computed(() => {
    const preference = this.resolvedPreference()
    if (!preference) {
      return this.#translate.instant('PAC.Chat.ClawXpert.NotConfigured', { Default: 'Not configured yet' })
    }

    return this.getXpertLabel(
      this.availableXperts().find((item) => item.id === preference.assistantId) ?? {
        id: preference.assistantId
      }
    )
  })
  readonly viewState = computed<ClawXpertViewState>(() => {
    if (!this.organizationId()) {
      return 'organization-required'
    }
    if (!this.chatkitFrameUrl()) {
      return 'error'
    }
    if (this.errorMessage()) {
      return 'error'
    }
    if (this.showWizard() || !this.resolvedPreference()) {
      return 'wizard'
    }
    return 'ready'
  })
  readonly control = injectHostedAssistantChatkitControl({
    identity: computed(() => (this.viewState() === 'ready' ? AssistantCode.CLAWXPERT : null)),
    assistantId: computed(() => this.resolvedPreference()?.assistantId ?? null),
    frameUrl: this.chatkitFrameUrl,
    titleKey: this.definition.titleKey,
    titleDefault: this.definition.defaultTitle
  })

  constructor() {
    effect(() => {
      const organizationId = this.organizationId()

      if (!organizationId) {
        this.#loadRequestId++
        this.preference.set(null)
        this.availableXperts.set([])
        this.errorMessage.set(null)
        this.showWizard.set(false)
        this.hasLoadedXperts.set(false)
        this.form.reset({ assistantId: '' }, { emitEvent: false })
        this.searchControl.setValue('')
        this.loading.set(false)
        return
      }

      void this.loadState()
    })
  }

  openWizard() {
    this.showWizard.set(true)
    this.errorMessage.set(null)
    this.form.controls.assistantId.setValue(this.resolvedPreference()?.assistantId ?? '')
  }

  cancelWizard() {
    if (!this.resolvedPreference()) {
      return
    }

    this.showWizard.set(false)
    this.errorMessage.set(null)
    this.form.controls.assistantId.setValue(this.resolvedPreference()?.assistantId ?? '')
  }

  selectXpert(id: string) {
    this.form.controls.assistantId.setValue(id)
    this.form.controls.assistantId.markAsTouched()
    this.form.controls.assistantId.markAsDirty()
  }

  async savePreference() {
    this.form.markAllAsTouched()
    if (this.form.invalid) {
      return
    }

    this.saving.set(true)
    try {
      const preference = (await firstValueFrom(
        this.#assistantBindingService.upsert({
          code: AssistantCode.CLAWXPERT,
          scope: AssistantBindingScope.USER,
          assistantId: this.form.getRawValue().assistantId
        })
      )) as IAssistantBinding

      this.preference.set(preference)
      this.showWizard.set(false)
      this.#toastr.success('PAC.MESSAGE.UpdateSuccess', { Default: 'Saved successfully' })
    } catch (error) {
      this.#toastr.error(
        getErrorMessage(error) ||
          this.#translate.instant('PAC.Chat.ClawXpert.SaveFailed', {
            Default: 'Failed to save the ClawXpert binding.'
          })
      )
    } finally {
      this.saving.set(false)
    }
  }

  async clearPreference() {
    this.clearing.set(true)
    try {
      await firstValueFrom(this.#assistantBindingService.delete(AssistantCode.CLAWXPERT, AssistantBindingScope.USER))
      this.preference.set(null)
      this.showWizard.set(true)
      this.form.reset({ assistantId: '' }, { emitEvent: false })
      this.#toastr.success('PAC.MESSAGE.UpdateSuccess', { Default: 'Saved successfully' })
    } catch (error) {
      this.#toastr.error(
        getErrorMessage(error) ||
          this.#translate.instant('PAC.Chat.ClawXpert.DeleteFailed', {
            Default: 'Failed to clear the ClawXpert binding.'
          })
      )
    } finally {
      this.clearing.set(false)
    }
  }

  getXpertLabel(xpert: Partial<IXpert> | null | undefined) {
    return xpert?.title || xpert?.titleCN || xpert?.name || xpert?.slug || xpert?.id || ''
  }

  viewErrorMessage() {
    if (!this.chatkitFrameUrl()) {
      return this.#translate.instant('PAC.Chat.ClawXpert.FrameMissing', {
        Default: 'CHATKIT_FRAME_URL is not configured for ClawXpert.'
      })
    }

    return (
      this.errorMessage() ||
      this.#translate.instant('PAC.Chat.ClawXpert.LoadFailedDesc', {
        Default: 'Check your assistant access and try again.'
      })
    )
  }

  private async loadState() {
    const requestId = ++this.#loadRequestId
    this.loading.set(true)
    this.errorMessage.set(null)
    this.hasLoadedXperts.set(false)

    try {
      const [preference, xperts] = await Promise.all([
        firstValueFrom(this.#assistantBindingService.get(AssistantCode.CLAWXPERT, AssistantBindingScope.USER)) as Promise<
          IAssistantBinding | null
        >,
        firstValueFrom(
          this.#assistantBindingService.getAvailableXperts(AssistantBindingScope.USER, AssistantCode.CLAWXPERT)
        ) as Promise<
          IXpert[]
        >
      ])

      const normalizedXperts = this.normalizeXperts(xperts)
      const isCurrentBindingAvailable = preference
        ? normalizedXperts.some((item) => item.id === preference.assistantId)
        : false

      if (requestId !== this.#loadRequestId) {
        return
      }

      this.preference.set(preference ?? null)
      this.availableXperts.set(normalizedXperts)
      this.hasLoadedXperts.set(true)
      this.showWizard.set(!preference || !isCurrentBindingAvailable)
      this.form.reset(
        {
          assistantId: isCurrentBindingAvailable ? preference?.assistantId ?? '' : ''
        },
        { emitEvent: false }
      )
      this.searchControl.setValue('')
    } catch (error) {
      if (requestId !== this.#loadRequestId) {
        return
      }

      this.errorMessage.set(
        getErrorMessage(error) ||
          this.#translate.instant('PAC.Chat.ClawXpert.LoadFailedDesc', {
            Default: 'Check your assistant access and try again.'
          })
      )
    } finally {
      if (requestId === this.#loadRequestId) {
        this.loading.set(false)
      }
    }
  }

  private normalizeXperts(items: IXpert[] | IPagination<IXpert> | null | undefined) {
    const seen = new Set<string>()
    const candidates = Array.isArray(items) ? items : (Array.isArray(items?.items) ? items.items : [])

    return candidates.filter((xpert): xpert is IXpert => {
      if (!xpert?.id || xpert.latest === false || seen.has(xpert.id)) {
        return false
      }

      seen.add(xpert.id)
      return true
    })
  }
}
