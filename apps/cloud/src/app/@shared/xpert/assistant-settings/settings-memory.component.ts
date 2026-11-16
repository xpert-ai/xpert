import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { ZardInputDirective } from '@xpert-ai/headless-ui'
import { CopilotPromptEditorComponent } from '@cloud/app/@shared/copilot'
import { SettingsFeatureComponent } from './settings-feature.component'
import { XpertSettingsEditor } from './xpert-settings.editor'

@Component({
  selector: 'xp-settings-memory',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    TranslateModule,
    ZardInputDirective,
    CopilotPromptEditorComponent,
    SettingsFeatureComponent
  ],
  template: `
    <xp-settings-feature
      titleKey="XP.XpertSettings.LongTermMemory"
      description="XP.XpertSettings.LongTermMemoryTip"
      [control]="form.enabled"
      [collapsible]="false"
      [expanded]="false"
    />
    <xp-settings-feature
      titleKey="XP.XpertSettings.Summary"
      description="XP.XpertSettings.SummaryTip"
      [control]="summary.enabled"
    >
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div class="flex items-center justify-between gap-3">
          <label for="assistant-max-messages" class="text-base">{{ 'XP.XpertSettings.MaxMessages' | translate }}</label
          ><input
            id="assistant-max-messages"
            z-input
            type="number"
            min="4"
            max="200"
            step="1"
            class="w-24 shrink-0"
            [formControl]="summary.maxMessages"
          />
        </div>
        <div class="flex items-center justify-between gap-3">
          <label for="assistant-retain-messages" class="text-base">{{
            'XP.XpertSettings.RetainMessages' | translate
          }}</label
          ><input
            id="assistant-retain-messages"
            z-input
            type="number"
            min="0"
            max="200"
            step="1"
            class="w-24 shrink-0"
            [formControl]="summary.retainMessages"
          />
        </div>
      </div>
      <p class="text-sm leading-5 text-text-tertiary">
        {{
          'XP.XpertSettings.SummaryExplanation'
            | translate
              : {
                  max: summary.maxMessages.value,
                  retain: summary.retainMessages.value,
                  count: (summary.maxMessages.value || 0) - (summary.retainMessages.value || 0)
                }
        }}
      </p>
      @if (form.summary.invalid) {
        <p role="alert" class="text-base text-text-destructive">{{ 'XP.XpertSettings.SummaryError' | translate }}</p>
      }
      <div class="text-base font-medium">{{ 'XP.XpertSettings.SummaryPrompt' | translate }}</div>
      <copilot-prompt-editor
        role="system"
        initHeight="100"
        [prompt]="summary.prompt.value"
        (promptChange)="editor.setText(summary.prompt, $event)"
      />
    </xp-settings-feature>
  `
})
export class SettingsMemoryComponent {
  readonly editor = inject(XpertSettingsEditor)
  readonly form = this.editor.form.controls.memory.controls
  readonly summary = this.form.summary.controls
}
