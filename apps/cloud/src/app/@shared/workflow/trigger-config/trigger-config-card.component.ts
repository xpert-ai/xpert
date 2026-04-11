import { CommonModule } from '@angular/common'
import { Component, computed, input, model } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgmI18nPipe } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { JSONSchemaFormComponent } from '../../forms'
import { hasJsonSchemaRequiredErrors, jsonSchemaHasConfigFields } from './trigger-config.util'
import { WorkflowTriggerProviderOption } from './types'

@Component({
  standalone: true,
  selector: 'xp-workflow-trigger-config-card',
  imports: [CommonModule, FormsModule, TranslateModule, NgmI18nPipe, JSONSchemaFormComponent],
  template: `
    @if (appearance() === 'card') {
      <div class="rounded-3xl border-[0.5px] border-divider-deep bg-components-card-bg">
        @if (showHeader()) {
          <div class="flex items-start justify-between gap-3 border-b border-divider-regular px-5 py-4">
            <div class="min-w-0">
              <div class="font-medium text-text-primary">
                {{
                  provider().name === 'chat'
                    ? ('PAC.Workflow.Chat' | translate: { Default: 'Chat' })
                    : provider().label
                      ? (provider().label | i18n)
                      : provider().name
                }}
              </div>
              <div class="mt-1 text-sm text-text-secondary">
                {{ provider().name }}
              </div>
            </div>

            @if (!shouldRenderConfig()) {
              <span class="inline-flex items-center rounded-full border border-divider-regular bg-background-default-subtle px-3 py-1 text-xs text-text-secondary">
                {{ 'PAC.Chat.ClawXpert.TriggerNoExtraConfigShort' | translate: { Default: 'No extra config' } }}
              </span>
            }
          </div>
        }

        <div class="px-5 py-4">
          <ng-container [ngTemplateOutlet]="content"></ng-container>
        </div>
      </div>
    } @else {
      <ng-container [ngTemplateOutlet]="content"></ng-container>
    }

    <ng-template #content>
      @if (shouldRenderConfig()) {
        <div class="space-y-3">
          <div class="text-xs uppercase tracking-[0.18em] text-text-tertiary">
            {{ configTitleKey() | translate: { Default: configTitleDefault() } }}
          </div>

          <json-schema-form
            class="grid grid-cols-1 gap-2"
            [schema]="provider().configSchema!"
            [ngModel]="normalizedConfig()"
            [ngModelOptions]="{ standalone: true }"
            (ngModelChange)="updateConfig($event)"
          />

          @if (showValidation() && isConfigInvalid()) {
            <div class="text-sm text-text-destructive">
              {{
                invalidMessageKey()
                  | translate
                    : {
                        Default: invalidMessageDefault()
                      }
              }}
            </div>
          }
        </div>
      } @else if (showEmptyState()) {
        <div class="rounded-2xl border border-dashed border-divider-regular bg-background-default-subtle px-4 py-4 text-sm leading-6 text-text-secondary">
          {{ emptyStateKey() | translate: { Default: emptyStateDefault() } }}
        </div>
      }
    </ng-template>
  `
})
export class WorkflowTriggerConfigCardComponent {
  readonly provider = input.required<WorkflowTriggerProviderOption>()
  readonly config = model<Record<string, unknown> | null | undefined>(undefined)
  readonly appearance = input<'card' | 'inline'>('card')
  readonly showHeader = input(true)
  readonly showEmptyState = input(true)
  readonly showValidation = input(true)
  readonly configTitleKey = input('PAC.KEY_WORDS.Configuration')
  readonly configTitleDefault = input('Configuration')
  readonly invalidMessageKey = input('PAC.Workflow.RequiredTriggerConfig')
  readonly invalidMessageDefault = input('Complete the required trigger configuration before continuing.')
  readonly emptyStateKey = input('PAC.Chat.ClawXpert.TriggerNoExtraConfig')
  readonly emptyStateDefault = input('No additional configuration is available for this trigger here.')

  readonly shouldRenderConfig = computed(() => {
    const provider = this.provider()
    return provider.name !== 'chat' && jsonSchemaHasConfigFields(provider.configSchema)
  })
  readonly normalizedConfig = computed<Record<string, unknown>>(() => {
    const value = this.config()
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  })
  readonly isConfigInvalid = computed(() => {
    if (!this.shouldRenderConfig()) {
      return false
    }

    return hasJsonSchemaRequiredErrors(this.provider().configSchema, this.normalizedConfig())
  })

  updateConfig(config: Record<string, unknown> | null | undefined) {
    this.config.set(config ?? {})
  }
}
