import { CommonModule } from '@angular/common'
import { booleanAttribute, Component, computed, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { SlashSvgComponent, VariableSvgComponent } from '@metad/ocap-angular/common'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { DisplayBehaviour } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { isNil } from 'lodash-es'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { TSelectOption, TXpertParameter, XpertParameterTypeEnum } from '../../../@core'
import { NgmSelectComponent } from '../../common'

@Component({
  standalone: true,
  selector: 'xpert-parameters-form',
  templateUrl: './parameters.component.html',
  styleUrl: 'parameters.component.scss',
  imports: [
    CommonModule,
    FormsModule,
    MatTooltipModule,
    TranslateModule,
    NgmI18nPipe,
    NgmSelectComponent,
    VariableSvgComponent,
    SlashSvgComponent,
  ],
  hostDirectives: [NgxControlValueAccessor]
})
export class XpertParametersFormComponent {
  eXpertParameterTypeEnum = XpertParameterTypeEnum
  eDisplayBehaviour = DisplayBehaviour

  protected cva = inject<NgxControlValueAccessor<Partial<Record<string, unknown>> | null>>(NgxControlValueAccessor)

  // Inputs
  readonly parameters = input<TXpertParameter[]>()
  readonly readonly = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  // States
  readonly params = computed<Array<TXpertParameter & {selectOptions?: TSelectOption[]}>>(() => {
    return this.parameters().map((parameter) => {
      if (parameter.type === XpertParameterTypeEnum.SELECT) {
        return {
          ...parameter,
          // Handle null/undefined options to prevent "Cannot read properties of null (reading 'map')" error
          // when user creates SELECT parameter with only name but no options
          selectOptions: (parameter.options ?? []).map((key) => ({
            value: key,
            label: key
          }))
        } as TXpertParameter
      }

      return parameter
    })
  })

  constructor() {
    // If the initial value is null, but there are parameters with default values, set the value to those defaults
    setTimeout(() => {
      if (this.cva.value == null && this.parameters()?.some((param) => !isNil(param.default))) {
        this.cva.writeValue(
          this.parameters().reduce((acc, cur) => ({ ...acc, [cur.name]: cur.default ?? null }), {})
        )
      }
    })
  }


  getParameter(name: string) {
    return this.cva.value?.[name]
  }

  updateParameter(name: string, value: unknown) {
    this.cva.writeValue({
      ...(this.cva.value ?? {}),
      [name]: value
    })
  }
}
