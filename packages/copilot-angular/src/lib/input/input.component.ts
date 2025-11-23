import { NgFor, NgIf } from '@angular/common'
import { Component, EventEmitter, Input, Output, computed, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms'
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete'
import { MatChipInputEvent, MatChipsModule } from '@angular/material/chips'
import { MatTooltipModule } from '@angular/material/tooltip'
import { TranslateModule } from '@ngx-translate/core'
import { NgmHighlightDirective } from '../core/directives'

/**
 * @deprecated use ChatKit instead
 */
@Component({
  standalone: true,
  selector: 'ngm-copilot-input',
  templateUrl: './input.component.html',
  styleUrl: './input.component.scss',
  imports: [NgIf, NgFor, TranslateModule, ReactiveFormsModule, MatTooltipModule, MatChipsModule, MatAutocompleteModule, NgmHighlightDirective]
})
export class NgmCopilotInputComponent {
  @Input() get suggests() {
    return this.#suggests()
  }
  set suggests(value) {
    this.#suggests.set(value)
  }
  readonly #suggests = signal<string[]>([])

  @Output() ask = new EventEmitter<{command?: string; prompt: string}>()

  answering = signal(false)
  suggesting = signal(false)
  error = ''
  promptControl = new FormControl('')
  formGroup = new FormGroup({ prompt: this.promptControl })

  readonly search = toSignal(this.promptControl.valueChanges, { initialValue: null })

  readonly filteredSuggests = computed(() => {
    if (this.#suggests()) {
      const search = this.search()?.toLowerCase()
      return search ? this.#suggests().filter((item) => item.toLowerCase().includes(search)) : this.#suggests().slice()
    }
    return []
  })

  /**
   * Add an ask prompt
   *
   * @param event
   */
  async add(event: MatChipInputEvent) {
    // Prompt value
    const value = (event.value || '').trim()

    // Clear the input value
    event.chipInput!.clear()
    this.promptControl.setValue(null)

    if (value) {
      //   await this.askCopilot(value)
    }
  }

  selected(event: MatAutocompleteSelectedEvent) {
    // this.promptInput.nativeElement.value = event.option.viewValue
    this.promptControl.setValue(event.option.viewValue)
  }

  onSubmit() {
    this.promptControl.setValue(null)
    this.ask.emit({ prompt: this.promptControl.value })
  }
}
