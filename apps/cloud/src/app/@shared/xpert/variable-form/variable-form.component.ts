import { CommonModule } from '@angular/common'
import { Component, inject, output, input, effect } from '@angular/core'
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { NgmSelectComponent } from '../../common'
import { TStateVariable, VariableOperationEnum } from '../../../@core/types'

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TranslateModule, NgmSelectComponent,],
  selector: 'xpert-variable-form',
  templateUrl: 'variable-form.component.html',
  styleUrls: ['variable-form.component.scss']
})
export class XpertVariableFormComponent {
  eVariableOperationEnum = VariableOperationEnum

  readonly #fb = inject(FormBuilder)

  // Inputs
  readonly variable = input<TStateVariable>()

  // Outputs
  readonly saved = output<Partial<TStateVariable>>()
  readonly cancel = output<void>()

  readonly form = this.#fb.group<TStateVariable>({
    name: null,
    type: null,
    default: null,
    description: null,
    operation: null
  })

  constructor() {
    effect(() => {
      if (this.variable()) {
        this.form.patchValue(this.variable())
      }
    }, { allowSignalWrites: true })
  }
}
