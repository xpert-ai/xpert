import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, signal, untracked } from '@angular/core'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { isEqual } from 'lodash-es'
import { ZardButtonComponent, ZardCardImports, ZardIconComponent, ZardMenuImports } from '@xpert-ai/headless-ui'
import {
  WorkflowTriggerProviderOption,
  WorkflowTriggerConfigCardComponent,
  buildJsonSchemaDefaults,
  hasJsonSchemaRequiredErrors,
  jsonSchemaHasConfigFields
} from '../../../@shared/workflow'
import { genXpertTriggerKey } from '../../../@core'
import { ClawXpertFacade, ClawXpertTriggerEditorItem } from './clawxpert.facade'

@Component({
  standalone: true,
  selector: 'pac-clawxpert-trigger-config-editor',
  imports: [
    CommonModule,
    TranslateModule,
    NgmI18nPipe,
    WorkflowTriggerConfigCardComponent,
    ZardButtonComponent,
    ZardIconComponent,
    ...ZardMenuImports,
    ...ZardCardImports
  ],
  template: `
    <z-card class="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-border shadow-none">
      <z-card-content class="flex min-h-0 flex-1 flex-col p-0">
        @if (isBlocked()) {
          <div class="flex min-h-[18rem] flex-1 flex-col items-center justify-center px-6 text-center">
            <z-icon zType="filter_alt" class="text-3xl text-text-tertiary"></z-icon>
            <div class="mt-4 text-lg font-semibold text-text-primary">
              {{ blockedState().titleKey | translate: { Default: blockedState().defaultTitle } }}
            </div>
            <p class="mt-2 max-w-xl text-sm leading-6 text-text-secondary">
              {{ blockedState().descKey | translate: { Default: blockedState().defaultDesc } }}
            </p>
          </div>
        } @else if (facade.loadingTriggerDraft()) {
          <div class="flex min-h-[18rem] flex-1 items-center justify-center px-6 text-sm text-text-secondary">
            {{ 'PAC.Chat.ClawXpert.LoadingTriggerDraft' | translate: { Default: 'Loading trigger draft…' } }}
          </div>
        } @else if (facade.triggerDraftErrorMessage()) {
          <div class="flex min-h-[18rem] flex-1 flex-col items-center justify-center px-6 text-center">
            <z-icon zType="warning" class="text-3xl text-text-tertiary"></z-icon>
            <div class="mt-4 text-lg font-semibold text-text-primary">
              {{
                'PAC.Chat.ClawXpert.TriggerDraftLoadFailed'
                  | translate: { Default: 'Failed to load trigger configuration.' }
              }}
            </div>
            <p class="mt-2 max-w-xl text-sm leading-6 text-text-secondary">
              {{ facade.triggerDraftErrorMessage() }}
            </p>
          </div>
        } @else {
          <div class="border-b border-divider-regular px-5 py-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div class="text-sm font-medium text-text-primary">
                  {{ 'PAC.Chat.ClawXpert.TriggerConfigTitle' | translate: { Default: 'Trigger configuration draft' } }}
                </div>
                <p class="mt-1 max-w-2xl text-sm leading-6 text-text-secondary">
                  {{
                    'PAC.Chat.ClawXpert.TriggerConfigDesc'
                      | translate
                        : {
                            Default:
                              'Adjust each trigger on the bound xpert draft here. Saving updates the draft only and still requires publish before runtime changes take effect.'
                          }
                  }}
                </p>
              </div>

              <div class="flex flex-wrap items-center justify-end gap-2">
                <span
                  class="inline-flex items-center rounded-full border border-divider-regular bg-background-default-subtle px-3 py-1 text-xs text-text-secondary"
                >
                  {{
                    'PAC.Chat.ClawXpert.TriggerCount'
                      | translate
                        : {
                            Default: '{count} triggers',
                            count: workingItems().length
                          }
                  }}
                </span>

                <button
                  z-button
                  zType="outline"
                  type="button"
                  displayDensity="cosy"
                  class="trigger-add-button"
                  z-menu
                  [zMenuTriggerFor]="addTriggerMenu"
                  [disabled]="facade.savingTriggerDraft() || !addableTriggerProviders().length"
                >
                  <span class="flex items-center gap-2">
                    <z-icon zType="add"></z-icon>
                    <span>{{ 'PAC.Chat.ClawXpert.AddTrigger' | translate: { Default: 'Add trigger' } }}</span>
                  </span>
                </button>
              </div>
            </div>
          </div>

          <ng-template #addTriggerMenu>
            <div z-menu-content class="w-64">
              @for (provider of addableTriggerProviders(); track provider.name) {
                <button type="button" z-menu-item (click)="addTrigger(provider)">
                  <div class="flex flex-col items-start gap-0.5">
                    <span class="text-sm font-medium text-text-primary">
                      {{ provider.label ? (provider.label | i18n) : provider.name }}
                    </span>
                    @if (provider.label) {
                      <span class="text-xs text-text-tertiary">{{ provider.name }}</span>
                    }
                  </div>
                </button>
              }
            </div>
          </ng-template>

          @if (!workingItems().length) {
            <div class="flex min-h-[18rem] flex-1 flex-col items-center justify-center px-6 text-center">
              <z-icon zType="notifications_off" class="text-3xl text-text-tertiary"></z-icon>
              <div class="mt-4 text-lg font-semibold text-text-primary">
                {{ 'PAC.Chat.ClawXpert.NoTriggerCardsTitle' | translate: { Default: 'No triggers to configure' } }}
              </div>
              <p class="mt-2 max-w-xl text-sm leading-6 text-text-secondary">
                {{
                  'PAC.Chat.ClawXpert.NoTriggerCardsDesc'
                    | translate
                      : {
                          Default: 'Use Add trigger to add a non-chat trigger to the bound xpert draft.'
                        }
                }}
              </p>
            </div>
          } @else {
            <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-5 py-4">
              @for (item of workingItems(); track item.nodeKey) {
                <xpert-workflow-trigger-config-card
                  [provider]="item.provider"
                  [config]="item.config"
                  [showHeader]="true"
                  (configChange)="updateConfig(item.nodeKey, $event)"
                />
              }
            </div>
          }

          <div class="flex flex-wrap items-center justify-between gap-3 border-t border-divider-regular px-5 py-4">
            <div class="text-xs text-text-tertiary">
              {{
                'PAC.Chat.ClawXpert.TriggerDraftHint'
                  | translate
                    : {
                        Default:
                          'These edits update the current xpert draft only. Publish the xpert later if you want the trigger runtime configuration to change.'
                      }
              }}
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <button
                z-button
                zType="outline"
                type="button"
                displayDensity="cosy"
                [disabled]="facade.savingTriggerDraft() || !dirty()"
                (click)="reset()"
              >
                {{ 'PAC.Common.Reset' | translate: { Default: 'Reset' } }}
              </button>
              <button
                z-button
                zType="default"

                type="button"
                displayDensity="cosy"
                [disabled]="facade.savingTriggerDraft() || !dirty() || invalid()"
                (click)="save()"
              >
                {{ 'PAC.Chat.ClawXpert.SaveTriggerDraft' | translate: { Default: 'Save draft' } }}
              </button>
            </div>
          </div>
        }
      </z-card-content>
    </z-card>
  `
})
export class ClawXpertTriggerConfigEditorComponent {
  readonly facade = inject(ClawXpertFacade)

  readonly workingItems = signal<ClawXpertTriggerEditorItem[]>(this.cloneItems(this.facade.triggerEditorItems()))
  readonly addableTriggerProviders = computed(() => {
    const existingProviders = new Set(this.workingItems().map((item) => item.provider.name))

    return this.facade
      .triggerProviderOptions()
      .filter((provider) => provider.name !== 'chat' && !existingProviders.has(provider.name))
  })
  readonly dirty = computed(() => !isEqual(this.workingItems(), this.facade.triggerEditorItems()))
  readonly invalid = computed(() =>
    this.workingItems().some((item) => {
      if (item.provider.name === 'chat' || !jsonSchemaHasConfigFields(item.provider.configSchema)) {
        return false
      }

      return hasJsonSchemaRequiredErrors(item.provider.configSchema, item.config ?? {})
    })
  )
  readonly isBlocked = computed(() => this.facade.viewState() !== 'ready' || !this.facade.xpertId())
  readonly blockedState = computed(() => {
    if (!this.facade.organizationId()) {
      return {
        titleKey: 'PAC.Chat.ClawXpert.TriggerOrganizationRequiredTitle',
        defaultTitle: 'Choose an organization first',
        descKey: 'PAC.Chat.ClawXpert.TriggerOrganizationRequiredDesc',
        defaultDesc: 'Select an organization and finish the ClawXpert setup before editing draft trigger configuration.'
      }
    }

    if (!this.facade.resolvedPreference()) {
      return {
        titleKey: 'PAC.Chat.ClawXpert.TriggerBindingRequiredTitle',
        defaultTitle: 'Bind ClawXpert before editing triggers',
        descKey: 'PAC.Chat.ClawXpert.TriggerBindingRequiredDesc',
        defaultDesc: 'Once a ClawXpert binding is ready, this panel will load the bound xpert trigger draft.'
      }
    }

    return {
      titleKey: 'PAC.Chat.ClawXpert.TriggerEditorUnavailableTitle',
      defaultTitle: 'Trigger draft editor is temporarily unavailable',
      descKey: 'PAC.Chat.ClawXpert.TriggerEditorUnavailableDesc',
      defaultDesc: 'The ClawXpert shell must be in the ready state before trigger draft configuration can be edited.'
    }
  })

  constructor() {
    effect(() => {
      const items = this.facade.triggerEditorItems()

      untracked(() => {
        this.workingItems.set(this.cloneItems(items))
      })
    })
  }

  updateConfig(nodeKey: string, config: Record<string, unknown> | null | undefined) {
    this.workingItems.update((items) =>
      items.map((item) =>
        item.nodeKey === nodeKey
          ? {
              ...item,
              config: config ?? {}
            }
          : item
      )
    )
  }

  addTrigger(provider: WorkflowTriggerProviderOption) {
    if (
      !provider?.name?.trim() ||
      provider.name === 'chat' ||
      this.workingItems().some((item) => item.provider.name === provider.name)
    ) {
      return
    }

    const config = this.createDefaultTriggerConfig(provider)
    this.workingItems.update((items) => [
      ...items,
      {
        nodeKey: genXpertTriggerKey(),
        provider: {
          ...provider
        },
        ...(config === undefined ? {} : { config })
      }
    ])
  }

  reset() {
    this.workingItems.set(this.cloneItems(this.facade.triggerEditorItems()))
  }

  async save() {
    if (this.invalid() || !this.dirty()) {
      return
    }

    await this.facade.saveTriggerDraft(this.workingItems())
  }

  private cloneItems(items: ClawXpertTriggerEditorItem[]) {
    return items.map((item) => ({
      ...item,
      provider: {
        ...item.provider
      },
      config: cloneTriggerConfig(item.config)
    }))
  }

  private createDefaultTriggerConfig(provider: WorkflowTriggerProviderOption) {
    if (provider.name === 'chat' || !jsonSchemaHasConfigFields(provider.configSchema)) {
      return undefined
    }

    return (buildJsonSchemaDefaults(provider.configSchema) ?? {}) as Record<string, unknown>
  }
}

function cloneTriggerConfig<T>(value: T): T {
  if (value == null || typeof value !== 'object') {
    return value
  }

  return JSON.parse(JSON.stringify(value)) as T
}
