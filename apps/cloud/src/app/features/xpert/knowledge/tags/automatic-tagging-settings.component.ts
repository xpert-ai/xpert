import { Component, model } from '@angular/core'
import { FormsModule, NgModel } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { AiModelTypeEnum, KnowledgeAutomaticTaggingConfig } from '@xpert-ai/contracts'
import { ZardFormImports, ZardInputDirective, ZardSwitchComponent } from '@xpert-ai/headless-ui'
import { CopilotModelSelectComponent } from '@cloud/app/@shared/copilot'

@Component({
  selector: 'xp-automatic-tagging-settings',
  standalone: true,
  imports: [
    FormsModule,
    TranslateModule,
    ...ZardFormImports,
    ZardInputDirective,
    ZardSwitchComponent,
    CopilotModelSelectComponent
  ],
  template: `
    <div data-automatic-tagging class="space-y-3">
      <div class="flex items-start justify-between gap-4">
        <div>
          <div class="font-medium text-text-primary">{{ prefix + 'Title' | translate }}</div>
          <p class="mt-1 text-sm leading-6 text-text-tertiary">{{ prefix + 'Description' | translate }}</p>
        </div>
        <z-switch [ngModel]="config()?.enabled ?? false" (ngModelChange)="update('enabled', $event)" />
      </div>
      @if (config()?.enabled) {
        <copilot-model-select
          [modelType]="llm"
          [label]="prefix + 'Model' | translate"
          [ngModel]="config()?.model"
          (ngModelChange)="update('model', $event)"
        />
        <p class="text-sm text-text-tertiary">{{ prefix + 'ModelHelp' | translate }}</p>
        <z-form-field>
          <z-form-label>{{ prefix + 'MaxTags' | translate }}</z-form-label>
          <input
            z-input
            type="number"
            #maximumInput="ngModel"
            min="1"
            max="10"
            step="1"
            [ngModel]="config()?.maxTags ?? 3"
            (ngModelChange)="setMaximum($event, maximumInput)"
          />
        </z-form-field>
        <z-form-field>
          <z-form-label>{{ prefix + 'Confidence' | translate }}</z-form-label>
          <input
            z-input
            type="number"
            #confidenceInput="ngModel"
            min="0"
            max="1"
            step="0.05"
            [ngModel]="config()?.confidenceThreshold ?? 0.7"
            (ngModelChange)="setConfidence($event, confidenceInput)"
          />
        </z-form-field>
        <div class="flex items-center justify-between gap-4">
          <span class="text-sm text-text-secondary">{{ prefix + 'AllowManual' | translate }}</span>
          <z-switch
            [ngModel]="config()?.allowWithManualTags ?? false"
            (ngModelChange)="update('allowWithManualTags', $event)"
          />
        </div>
        <p class="text-sm text-text-tertiary">{{ prefix + 'ManualHelp' | translate }}</p>
      }
    </div>
  `
})
export class AutomaticTaggingSettingsComponent {
  readonly config = model<KnowledgeAutomaticTaggingConfig | null | undefined>(null)
  readonly prefix = 'XP.Knowledgebase.AutomaticTagging.'
  readonly llm = AiModelTypeEnum.LLM

  update<K extends keyof KnowledgeAutomaticTaggingConfig>(key: K, value: KnowledgeAutomaticTaggingConfig[K]) {
    this.config.update((current) => ({ enabled: false, ...current, [key]: value }))
  }
  setMaximum(value: number, input?: NgModel) {
    const normalized =
      typeof value === 'number' && Number.isFinite(value) ? Math.max(1, Math.min(10, Math.floor(value))) : 3
    this.update('maxTags', normalized)
    // Repeated out-of-range edits may normalize to an unchanged model value.
    input?.control.setValue(normalized, { emitEvent: false, emitViewToModelChange: false })
  }
  setConfidence(value: number, input?: NgModel) {
    const normalized = typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.7
    this.update('confidenceThreshold', normalized)
    input?.control.setValue(normalized, { emitEvent: false, emitViewToModelChange: false })
  }
}
