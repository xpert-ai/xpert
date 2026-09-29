import { DragDropModule, CdkDragDrop } from '@angular/cdk/drag-drop'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent, ZardInputDirective } from '@xpert-ai/headless-ui'
import { CopilotPromptEditorComponent } from '@cloud/app/@shared/copilot'
import { SettingsFeatureComponent } from './settings-feature.component'
import { XpertSettingsEditor } from './xpert-settings.editor'

@Component({
  selector: 'xp-settings-conversation',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    TranslateModule,
    DragDropModule,
    ZardButtonComponent,
    ZardInputDirective,
    CopilotPromptEditorComponent,
    SettingsFeatureComponent
  ],
  template: `
    <xp-settings-feature
      titleKey="XP.XpertSettings.Opener"
      description="XP.XpertSettings.OpenerTip"
      [control]="form.opener.controls.enabled"
    >
      <label for="assistant-opener" class="block text-base font-medium">{{
        'XP.XpertSettings.WelcomeMessage' | translate
      }}</label>
      <textarea
        id="assistant-opener"
        z-input
        class="min-h-24 w-full resize-y"
        [formControl]="form.opener.controls.message"
      ></textarea>
      <div class="flex items-center justify-between">
        <h4 class="text-lg font-medium">{{ 'XP.XpertSettings.StarterQuestions' | translate }}</h4>
        <button z-button zType="outline" [zDisabled]="questions.length >= 10" (click)="addQuestion()">
          <i class="ri-add-line" aria-hidden="true"></i>{{ 'XP.ACTIONS.Add' | translate }}
        </button>
      </div>
      <div
        cdkDropList
        [cdkDropListData]="questions.controls"
        (cdkDropListDropped)="dropQuestion($event)"
        class="space-y-2"
      >
        @for (question of questions.controls; track question; let index = $index) {
          <div cdkDrag class="flex items-center gap-2 bg-components-card-bg">
            <button
              type="button"
              cdkDragHandle
              class="cursor-grab p-1 text-text-tertiary"
              [attr.aria-label]="'XP.XpertSettings.ReorderQuestion' | translate"
            >
              <i class="ri-draggable" aria-hidden="true"></i>
            </button>
            <input
              z-input
              class="min-w-0 flex-1"
              [attr.aria-label]="('XP.XpertSettings.Question' | translate) + ' ' + (index + 1)"
              [formControl]="question"
            />
            <button
              type="button"
              class="rounded p-1 hover:bg-hover-bg disabled:opacity-30"
              [disabled]="$first"
              [attr.aria-label]="'XP.XpertSettings.MoveUp' | translate"
              (click)="moveQuestion(index, index - 1)"
            >
              <i class="ri-arrow-up-line" aria-hidden="true"></i>
            </button>
            <button
              type="button"
              class="rounded p-1 hover:bg-hover-bg disabled:opacity-30"
              [disabled]="$last"
              [attr.aria-label]="'XP.XpertSettings.MoveDown' | translate"
              (click)="moveQuestion(index, index + 1)"
            >
              <i class="ri-arrow-down-line" aria-hidden="true"></i>
            </button>
            <button
              type="button"
              class="rounded p-1 text-text-tertiary hover:text-text-destructive"
              [attr.aria-label]="'XP.ACTIONS.Delete' | translate"
              (click)="questions.removeAt(index)"
            >
              <i class="ri-delete-bin-line" aria-hidden="true"></i>
            </button>
          </div>
        }
      </div>
      <p class="text-sm text-text-tertiary">{{ 'XP.XpertSettings.QuestionsLimit' | translate }}</p>
    </xp-settings-feature>
    <xp-settings-feature
      titleKey="XP.XpertSettings.FrequentQuestions"
      description="XP.XpertSettings.FrequentQuestionsTip"
      [control]="form.frequentQuestions"
      [collapsible]="false"
    />
    <xp-settings-feature
      titleKey="XP.XpertSettings.Suggestion"
      description="XP.XpertSettings.SuggestionTip"
      [control]="form.suggestion.controls.enabled"
    >
      <div class="text-base font-medium">{{ 'XP.XpertSettings.Prompt' | translate }}</div>
      <copilot-prompt-editor
        role="system"
        initHeight="120"
        [prompt]="form.suggestion.controls.prompt.value"
        (promptChange)="editor.setText(form.suggestion.controls.prompt, $event)"
      />
    </xp-settings-feature>
    <xp-settings-feature
      titleKey="XP.XpertSettings.TitleGeneration"
      description="XP.XpertSettings.TitleGenerationTip"
      [control]="form.title.controls.enabled"
    >
      <div class="text-base font-medium">{{ 'XP.XpertSettings.Instruction' | translate }}</div>
      <copilot-prompt-editor
        role="system"
        initHeight="120"
        [prompt]="form.title.controls.instruction.value"
        (promptChange)="editor.setText(form.title.controls.instruction, $event)"
      />
    </xp-settings-feature>
  `
})
export class SettingsConversationComponent {
  readonly editor = inject(XpertSettingsEditor)
  readonly form = this.editor.form.controls.conversation.controls
  readonly questions = this.form.opener.controls.questions
  addQuestion() {
    if (this.questions.length < 10) this.questions.push(new FormControl('', { nonNullable: true }))
  }
  dropQuestion(event: CdkDragDrop<FormControl<string>[]>) {
    this.moveQuestion(event.previousIndex, event.currentIndex)
  }
  moveQuestion(from: number, to: number) {
    if (from === to || to < 0 || to >= this.questions.length) return
    const control = this.questions.at(from)
    this.questions.removeAt(from, { emitEvent: false })
    this.questions.insert(to, control)
  }
}
