
import { Component, EventEmitter, Input, Output, computed, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { NgmHighlightDirective } from '../core/directives'
import { ZardChipInputEvent, ZardComboboxComponent, ZardComboboxOptionTemplateDirective, ZardTooltipImports } from '@xpert-ai/headless-ui'
/**
 * @deprecated use ChatKit instead
 */
@Component({
  standalone: true,
  selector: 'ngm-copilot-input',
  templateUrl: './input.component.html',
  styleUrl: './input.component.scss',
  imports: [
    TranslateModule,
    ReactiveFormsModule,
    ZardComboboxComponent,
    ZardComboboxOptionTemplateDirective,
    ...ZardTooltipImports,
    NgmHighlightDirective
]
})
export class NgmCopilotInputComponent {
  @Input() get suggests() {
    return this.#suggests()
  }
  set suggests(value) {
    this.#suggests.set(value)
  }
  readonly #suggests = signal<string[]>([])

  @Output() ask = new EventEmitter<{ command?: string; prompt: string }>()

  answering = signal(false)
  suggesting = signal(false)
  error = ''
  promptControl = new FormControl('')
  formGroup = new FormGroup({ prompt: this.promptControl })
  readonly comboboxOptions = computed(() =>
    this.filteredSuggests().map((prompt) => ({
      id: prompt,
      label: prompt,
      value: prompt
    }))
  )

  readonly search = toSignal(this.promptControl.valueChanges, { initialValue: null })

  readonly filteredSuggests = computed(() => {
    if (this.#suggests()) {
      const search = this.search()?.toLowerCase()
      return search ? this.#suggests().filter((item) => item.toLowerCase().includes(search)) : this.#suggests().slice()
    }
    return []
  })

  onSearchTermChange(value: string) {
    this.promptControl.setValue(value)
  }

  onSubmit() {
    const prompt = this.promptControl.value?.trim()
    if (!prompt) {
      return
    }

    this.promptControl.setValue(null)
    this.ask.emit({ prompt })
  }
}
