import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { FormControl, FormsModule } from '@angular/forms'
import { AiModelTypeEnum, type TCopilotModel } from '@xpert-ai/contracts'
import { CopilotModelSelectComponent } from '@cloud/app/@shared/copilot'

/** Catalog hydration may normalize defaults; only user interaction may edit this draft. */
@Component({
  selector: 'xp-settings-model-select',
  standalone: true,
  imports: [FormsModule, CopilotModelSelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      '[&_.model-select-trigger]:h-10 [&_.model-select-trigger]:border-0 [&_.model-select-trigger_.truncate]:text-base [&_.model-select-trigger_img]:size-6 [&_.model-select-trigger_.whitespace-nowrap]:text-sm [&_.model-select-trigger_.whitespace-nowrap]:h-6',
    '(pointerdown)': 'interacted = true',
    '(keydown)': 'onKeydown($event)'
  },
  template: `
    <copilot-model-select
      class="block w-full"
      [hiddenLabel]="true"
      [modelType]="modelType()"
      [required]="required()"
      [clearable]="!required()"
      [ngModel]="control().value"
      [ngModelOptions]="{ standalone: true }"
      (ngModelChange)="change($event)"
    />
  `
})
export class SettingsModelSelectComponent {
  readonly control = input.required<FormControl<TCopilotModel | null>>()
  readonly modelType = input(AiModelTypeEnum.LLM)
  readonly required = input(false)
  interacted = false
  onKeydown(event: KeyboardEvent) {
    if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) this.interacted = true
  }
  change(value: TCopilotModel | null) {
    if (!this.interacted) return
    this.control().markAsDirty()
    this.control().setValue(value)
  }
}
