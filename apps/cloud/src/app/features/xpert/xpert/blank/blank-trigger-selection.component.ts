import { CommonModule } from '@angular/common'
import { Component, computed, input, model } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { JsonSchemaObjectType, TWorkflowTriggerMeta } from '../../../../@core'
import { JSONSchemaFormComponent } from 'apps/cloud/src/app/@shared/forms'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { BlankTriggerSelection } from './blank-draft.util'
import {
  buildJsonSchemaDefaults,
  hasJsonSchemaRequiredErrors,
  jsonSchemaHasConfigFields
} from './blank-trigger-config.util'

export type BlankTriggerProviderOption = Pick<TWorkflowTriggerMeta, 'name' | 'label'> & {
  configSchema?: JsonSchemaObjectType | null
}

@Component({
  standalone: true,
  selector: 'xpert-blank-trigger-selection',
  imports: [CommonModule, FormsModule, TranslateModule, NgmI18nPipe, JSONSchemaFormComponent],
  template: `
    <div class="rounded-xl bg-background-default-subtle px-4 py-2 space-y-3">
      <div class="text-sm leading-6 text-text-secondary">
        {{ descriptionKey() | translate: { Default: defaultDescription() } }}
      </div>

      <div class="grid gap-2 md:grid-cols-2">
        @for (provider of providers(); track provider.name) {
          <div class="rounded-xl border border-components-panel-border bg-components-card-bg px-4 py-3">
            <label class="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                class="mt-0.5 h-4 w-4 shrink-0"
                [ngModel]="isSelected(provider.name)"
                (ngModelChange)="toggleProvider(provider, $event)"
              />
              <div class="min-w-0">
                <div class="font-medium text-text-primary">
                  {{
                    provider.name === 'chat'
                      ? ('PAC.Workflow.Chat' | translate: { Default: 'Chat' })
                      : provider.label
                        ? (provider.label | i18n)
                        : provider.name
                  }}
                </div>
                <div class="text-sm text-text-secondary">
                  {{ provider.name }}
                </div>
              </div>
            </label>

            @if (isSelected(provider.name) && shouldRenderConfig(provider)) {
              <div class="mt-3 rounded-xl border border-divider-regular bg-background-default px-3 py-3">
                <div class="mb-2 text-xs uppercase tracking-[0.18em] text-text-tertiary">
                  {{ 'PAC.KEY_WORDS.Configuration' | translate: { Default: 'Configuration' } }}
                </div>
                <json-schema-form
                  class="grid grid-cols-1 gap-2"
                  [schema]="provider.configSchema!"
                  [ngModel]="getConfig(provider.name)"
                  [ngModelOptions]="{ standalone: true }"
                  (ngModelChange)="updateConfig(provider.name, $event)"
                />

                @if (isConfigInvalid(provider.name)) {
                  <div class="mt-2 text-sm text-text-destructive">
                    {{
                      'PAC.Workflow.RequiredTriggerConfig'
                        | translate: { Default: 'Complete the required trigger configuration before continuing.' }
                    }}
                  </div>
                }
              </div>
            }
          </div>
        } @empty {
          <div class="rounded-xl border border-dashed border-components-panel-border px-4 py-6 text-sm text-text-secondary">
            {{ emptyKey() | translate: { Default: emptyDefault() } }}
          </div>
        }
      </div>
    </div>
  `
})
export class BlankTriggerSelectionComponent {
  readonly providers = input<BlankTriggerProviderOption[]>([])
  readonly descriptionKey = input.required<string>()
  readonly defaultDescription = input.required<string>()
  readonly emptyKey = input<string>('PAC.Workflow.NoTriggersAvailable')
  readonly emptyDefault = input<string>('No trigger providers available')
  readonly selections = model<BlankTriggerSelection[]>([])

  readonly invalid = computed(() => this.providers().some((provider) => this.isConfigInvalid(provider.name)))

  isSelected(name: string) {
    return this.selections().some((selection) => selection.provider === name)
  }

  getConfig(name: string) {
    return this.selections().find((selection) => selection.provider === name)?.config ?? {}
  }

  toggleProvider(provider: BlankTriggerProviderOption, enabled: boolean) {
    if (enabled) {
      const existing = this.selections().find((selection) => selection.provider === provider.name)
      const config =
        existing?.config ??
        (this.shouldRenderConfig(provider) ? ((buildJsonSchemaDefaults(provider.configSchema) ?? {}) as Record<string, unknown>) : undefined)

      this.selections.set(
        existing
          ? this.selections().map((selection) =>
              selection.provider === provider.name ? { ...selection, config } : selection
            )
          : [...this.selections(), config === undefined ? { provider: provider.name } : { provider: provider.name, config }]
      )
      return
    }

    this.selections.set(this.selections().filter((selection) => selection.provider !== provider.name))
  }

  updateConfig(name: string, config: Record<string, unknown>) {
    this.selections.set(
      this.selections().map((selection) =>
        selection.provider === name ? { ...selection, config: config ?? {} } : selection
      )
    )
  }

  shouldRenderConfig(provider: BlankTriggerProviderOption) {
    return provider.name !== 'chat' && jsonSchemaHasConfigFields(provider.configSchema)
  }

  isConfigInvalid(name: string) {
    const provider = this.providers().find((item) => item.name === name)
    if (!provider || !this.isSelected(name) || !this.shouldRenderConfig(provider)) {
      return false
    }

    return hasJsonSchemaRequiredErrors(provider.configSchema, this.getConfig(name))
  }
}
