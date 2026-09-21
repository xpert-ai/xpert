import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { ZardCheckboxComponent, ZardInputDirective } from '@xpert-ai/headless-ui'
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
    ZardCheckboxComponent,
    ZardInputDirective,
    CopilotPromptEditorComponent,
    SettingsFeatureComponent
  ],
  template: `
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
    <xp-settings-feature
      titleKey="XP.XpertSettings.LongTermMemory"
      description="XP.XpertSettings.LongTermMemoryTip"
      [control]="longTerm.enabled"
      [expanded]="false"
    >
      <z-checkbox [formControl]="longTerm.profileEnabled">{{
        'XP.Xpert.LongTermMemoryTypeEnum.UserProfile' | translate
      }}</z-checkbox>
      <div class="flex items-center justify-between gap-4">
        <label for="assistant-memory-delay" class="text-base">{{ 'XP.XpertSettings.MemoryDelay' | translate }}</label
        ><input
          id="assistant-memory-delay"
          z-input
          type="number"
          min="0"
          max="100"
          step="1"
          class="w-24"
          [formControl]="longTerm.afterSeconds"
        />
      </div>
      <div class="text-base font-medium">{{ 'XP.XpertSettings.ProfilePrompt' | translate }}</div>
      <copilot-prompt-editor
        role="system"
        initHeight="100"
        [prompt]="longTerm.profilePrompt.value"
        (promptChange)="editor.setText(longTerm.profilePrompt, $event)"
      />
      <div class="border-t border-divider-regular pt-4">
        <z-checkbox [formControl]="longTerm.qaEnabled">{{ 'XP.XpertSettings.QAExperience' | translate }}</z-checkbox>
      </div>
      <div class="text-base font-medium">{{ 'XP.XpertSettings.QAPrompt' | translate }}</div>
      <copilot-prompt-editor
        role="system"
        initHeight="100"
        [prompt]="longTerm.qaPrompt.value"
        (promptChange)="editor.setText(longTerm.qaPrompt, $event)"
      />
    </xp-settings-feature>
    <div class="flex justify-end py-2">
      <a
        class="text-sm font-medium text-text-secondary hover:text-text-primary hover:underline"
        [href]="memoryUrl"
        target="_blank"
        rel="noopener"
        >{{ 'XP.XpertSettings.ManageMemory' | translate }}<i class="ri-arrow-right-up-line ml-1" aria-hidden="true"></i
        ><span class="sr-only">{{ 'XP.XpertSettings.NewTab' | translate }}</span></a
      >
    </div>
    <xp-settings-feature
      titleKey="XP.XpertSettings.MemoryReply"
      description="XP.XpertSettings.MemoryReplyTip"
      [control]="reply.enabled"
      [collapsible]="false"
    >
      <div class="flex items-center gap-3">
        <label for="assistant-memory-threshold" class="shrink-0 text-base">{{
          'XP.XpertSettings.ScoreThreshold' | translate
        }}</label
        ><input
          type="range"
          min="0.8"
          max="1"
          step="0.01"
          class="min-w-0 flex-1 accent-primary"
          [attr.aria-label]="'XP.XpertSettings.ScoreThreshold' | translate"
          [formControl]="reply.scoreThreshold"
        /><input
          id="assistant-memory-threshold"
          z-input
          type="number"
          min="0.8"
          max="1"
          step="0.01"
          class="w-24"
          [formControl]="reply.scoreThreshold"
        />
      </div>
      <div class="flex justify-between text-sm text-text-tertiary">
        <span>{{ 'XP.XpertSettings.BroadMatch' | translate }}</span
        ><span>{{ 'XP.XpertSettings.ExactMatch' | translate }}</span>
      </div>
    </xp-settings-feature>
  `
})
export class SettingsMemoryComponent {
  readonly editor = inject(XpertSettingsEditor)
  readonly form = this.editor.form.controls.memory.controls
  readonly summary = this.form.summary.controls
  readonly longTerm = this.form.longTerm.controls
  readonly reply = this.form.reply.controls
  readonly memoryUrl = `/xpert/x/${encodeURIComponent(this.editor.source.id)}/memory`
}
