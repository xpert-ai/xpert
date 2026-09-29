import { ASSISTANT_SETTINGS_CONTEXT } from '../../../@shared/xpert/assistant-settings/assistant-settings-context'
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { XpI18nPipe, ZardButtonComponent, ZardIconComponent } from '@xpert-ai/headless-ui'
import { isEqual } from 'lodash-es'
import { genXpertTriggerKey, getErrorMessage, ToastrService } from '../../../@core'
import { JSONSchemaFormComponent } from '../../../@shared/forms'
import {
  buildJsonSchemaDefaults,
  hasJsonSchemaRequiredErrors,
  jsonSchemaHasConfigFields
} from '../../../@shared/workflow'
import { ClawXpertFacade } from '../../chat/clawxpert/clawxpert.facade'
import { AssistantTriggerCard, mergeAssistantTrigger } from './assistant-trigger.utils'

export interface AssistantTriggerDialogData {
  card: AssistantTriggerCard
  organizationId: string
  xpertId: string
}

@Component({
  standalone: true,
  selector: 'xp-assistant-trigger-dialog',
  imports: [FormsModule, TranslateModule, XpI18nPipe, JSONSchemaFormComponent, ZardButtonComponent, ZardIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="flex max-h-[85dvh] w-[520px] max-w-[calc(100vw-32px)] flex-col">
      <header class="flex items-center justify-between gap-3 border-b border-border px-6 py-5">
        <h2 class="text-lg font-semibold">{{ data.card.provider.label | i18n }}</h2>
        <button
          z-button
          zType="ghost"
          zSize="icon-sm"
          type="button"
          [zDisabled]="saving()"
          (click)="dialogRef.close()"
          [attr.aria-label]="'XP.AssistantSettings.Close' | translate"
        >
          <z-icon zType="x" />
        </button>
      </header>
      <div class="min-h-0 flex-1 overflow-y-auto p-6">
        <p class="mb-5 text-sm leading-6 text-muted-foreground">
          {{ 'XP.AssistantSettings.TriggerConfigIntro' | translate }}
        </p>
        @if (configSchema; as schema) {
          @if (hasFields()) {
            <json-schema-form
              class="grid grid-cols-1 gap-4"
              [schema]="schema"
              [context]="context"
              [readonly]="saving() || bindingChanged()"
              [ngModel]="config()"
              (ngModelChange)="config.set($event)"
            />
          } @else {
            <p class="text-sm text-muted-foreground">{{ 'XP.AssistantSettings.NoTriggerFields' | translate }}</p>
          }
        }
        @if (invalid()) {
          <p class="mt-4 text-sm text-destructive">
            {{
              'XP.Workflow.RequiredTriggerConfig'
                | translate: { Default: 'Complete the required trigger configuration before continuing.' }
            }}
          </p>
        }
        @if (bindingChanged()) {
          <p role="alert" class="mt-4 text-sm text-destructive">
            {{ 'XP.AssistantSettings.BindingChanged' | translate }}
          </p>
        }
        @if (error()) {
          <p role="alert" class="mt-4 text-sm text-destructive">{{ error() }}</p>
        }
      </div>
      <footer class="border-t border-border px-6 py-4">
        <p class="mb-4 text-xs leading-5 text-muted-foreground">
          {{ 'XP.AssistantSettings.TriggerSaveHint' | translate }}
        </p>
        <div class="flex justify-end gap-2">
          <button z-button zType="outline" type="button" [zDisabled]="saving()" (click)="dialogRef.close()">
            {{ 'XP.AssistantSettings.Cancel' | translate }}
          </button>
          <button
            z-button
            type="button"
            [zDisabled]="saving() || facade.savingTriggerDraft() || invalid() || bindingChanged() || !dirty()"
            (click)="save()"
          >
            {{ (saving() ? 'XP.AssistantSettings.Saving' : 'XP.Chat.ClawXpert.SaveTriggerDraft') | translate }}
          </button>
        </div>
      </footer>
    </section>
  `
})
export class AssistantTriggerDialogComponent {
  readonly data = inject<AssistantTriggerDialogData>(DIALOG_DATA)
  readonly dialogRef = inject<DialogRef<boolean>>(DialogRef)
  readonly facade = inject(ASSISTANT_SETTINGS_CONTEXT, { optional: true }) ?? inject(ClawXpertFacade)
  private readonly toastr = inject(ToastrService)
  private readonly translate = inject(TranslateService)
  readonly initialConfig = structuredClone(
    this.data.card.item?.config ?? buildJsonSchemaDefaults(this.data.card.provider.configSchema) ?? {}
  )
  readonly config = signal<Record<string, unknown>>({ ...structuredClone(this.initialConfig), enabled: true })
  // Connection actions own the enabled flag; the dialog edits the remaining configuration.
  readonly configSchema = this.data.card.provider.configSchema
    ? {
        ...this.data.card.provider.configSchema,
        properties: Object.fromEntries(
          Object.entries(this.data.card.provider.configSchema.properties).filter(([key]) => key !== 'enabled')
        ),
        required: this.data.card.provider.configSchema.required?.filter((key) => key !== 'enabled')
      }
    : undefined
  readonly saving = signal(false)
  readonly error = signal<string | null>(null)
  readonly hasFields = computed(() => jsonSchemaHasConfigFields(this.configSchema))
  readonly invalid = computed(() => hasJsonSchemaRequiredErrors(this.data.card.provider.configSchema, this.config()))
  readonly dirty = computed(() => !this.data.card.item || !isEqual(this.config(), this.initialConfig))
  readonly bindingChanged = computed(
    () =>
      this.facade.organizationId() !== this.data.organizationId ||
      this.facade.xpertId() !== this.data.xpertId ||
      this.facade.viewState() !== 'ready'
  )
  readonly context = { workspaceId: this.facade.currentWorkspaceId(), xpertId: this.data.xpertId }

  async save() {
    if (this.saving() || this.facade.savingTriggerDraft() || this.invalid() || this.bindingChanged() || !this.dirty())
      return
    const items = this.facade.triggerEditorItems()
    const original = this.data.card.item
    const current = original ? items.find((item) => item.nodeKey === original.nodeKey) : undefined
    if (
      (original && (!current || !isEqual(current.config, original.config))) ||
      (!original && items.some((item) => item.provider.name === this.data.card.provider.name))
    ) {
      this.error.set(this.translate.instant('XP.AssistantSettings.TriggerChanged'))
      return
    }
    this.saving.set(true)
    this.dialogRef.disableClose = true
    this.error.set(null)
    try {
      const draft = await this.facade.saveTriggerDraft(
        mergeAssistantTrigger(items, {
          nodeKey: original?.nodeKey ?? genXpertTriggerKey(),
          provider: this.data.card.provider,
          config: { ...structuredClone(this.config()), enabled: true }
        })
      )
      if (draft) this.dialogRef.close(true)
      else this.error.set(this.translate.instant('XP.AssistantSettings.TriggerSaveFailed'))
    } catch (error) {
      const message = getErrorMessage(error) || this.translate.instant('XP.AssistantSettings.TriggerSaveFailed')
      this.error.set(message)
      this.toastr.error(message)
    } finally {
      this.saving.set(false)
      this.dialogRef.disableClose = false
    }
  }
}
