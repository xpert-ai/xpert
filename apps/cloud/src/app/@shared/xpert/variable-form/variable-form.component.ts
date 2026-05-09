import { Component, inject, output, input, effect } from '@angular/core'
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { NgmI18nPipe } from '@xpert-ai/ocap-angular/core'
import { ZardSelectImports } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { TStateVariable, VariableOperationEnum, XpertParameterTypeEnum } from '../../../@core/types'

@Component({
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule, TranslateModule, NgmI18nPipe, ...ZardSelectImports],
  selector: 'xpert-variable-form',
  templateUrl: 'variable-form.component.html',
  styleUrls: ['variable-form.component.scss']
})
export class XpertVariableFormComponent {
  eVariableOperationEnum = VariableOperationEnum

  readonly typeOptions = [
    {
      value: 'string',
      label: {
        en_US: 'String',
        zh_Hans: '字符串'
      }
    },
    {
      value: 'number',
      label: {
        en_US: 'Number',
        zh_Hans: '数字'
      }
    },
    {
      value: 'object',
      label: {
        en_US: 'Object',
        zh_Hans: '对象'
      }
    },
    {
      value: 'array[string]',
      label: {
        en_US: 'String[]',
        zh_Hans: '字符串数组'
      }
    },
    {
      value: 'array[number]',
      label: {
        en_US: 'Number[]',
        zh_Hans: '数字数组'
      }
    },
    {
      value: 'array[object]',
      label: {
        en_US: 'Object[]',
        zh_Hans: '对象数组'
      }
    }
  ]

  readonly operationOptions = [
    {
      value: VariableOperationEnum.APPEND,
      label: {
        en_US: 'Append',
        zh_Hans: '追加'
      }
    },
    {
      value: VariableOperationEnum.OVERWRITE,
      label: {
        en_US: 'Overwrite',
        zh_Hans: '覆盖'
      }
    }
  ]

  readonly #fb = inject(FormBuilder)

  // Inputs
  readonly variable = input<TStateVariable>()

  // Outputs
  readonly saved = output<any>()
  readonly cancel = output<void>()

  readonly form = this.#fb.group<TStateVariable>({
    name: null,
    type: XpertParameterTypeEnum.STRING,
    default: null,
    description: null,
    operation: null
  })

  constructor() {
    effect(() => {
      if (this.variable()) {
        this.form.patchValue(this.variable() as any)
      }
    })
  }
}
