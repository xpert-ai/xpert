import { CommonModule } from '@angular/common'
import { Component, inject, output, input, effect } from '@angular/core'
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { NgmSelectComponent } from '../../common'
import { TEnvironmentVariable, VariableOperationEnum } from '../../../@core/types'
import { VariableTypeOptions } from '../types'


@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TranslateModule, NgmSelectComponent,
  ],
  selector: 'xpert-env-variable-form',
  templateUrl: 'variable-form.component.html',
  styleUrls: ['variable-form.component.scss']
})
export class XpertEnvVariableFormComponent {
  eVariableOperationEnum = VariableOperationEnum
  readonly VariableTypeOptions = VariableTypeOptions

  readonly #fb = inject(FormBuilder)

  // Inputs
  readonly variable = input<TEnvironmentVariable>()

  // Outputs
  readonly saved = output<any>()
  readonly cancel = output<void>()

  readonly form = this.#fb.group<TEnvironmentVariable>({
    name: null,
    type: null,
    value: null,
    owner: null
  })

  get type() {
    return this.form.value.type
  }

  constructor() {
    effect(() => {
      if (this.variable()) {
        this.form.patchValue(this.variable() as any)
      }
    }, { allowSignalWrites: true })
  }
}
