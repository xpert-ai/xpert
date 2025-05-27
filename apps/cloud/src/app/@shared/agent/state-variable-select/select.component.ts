import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { booleanAttribute, Component, computed, effect, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import {
  agentLabel,
  getVariableSchema,
  TStateVariable,
  TStateVariableType,
  TWorkflowVarGroup,
  XpertParameterTypeEnum
} from '../../../@core/types'

/**
 *
 */
@Component({
  standalone: true,
  imports: [CommonModule, CdkMenuModule, FormsModule, TranslateModule, NgmI18nPipe],
  selector: 'xpert-state-variable-select',
  templateUrl: 'select.component.html',
  styleUrls: ['select.component.scss'],
  hostDirectives: [NgxControlValueAccessor],
  host: {
    tabindex: '-1',
    '[class.inline]': 'inline()'
  }
})
export class StateVariableSelectComponent {
  eXpertParameterTypeEnum = XpertParameterTypeEnum
  agentLabel = agentLabel

  protected cva = inject<NgxControlValueAccessor<string>>(NgxControlValueAccessor)

  // Inputs
  readonly variables = input<TWorkflowVarGroup[]>()
  readonly type = input<TStateVariableType>()
  readonly inline = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  // States
  readonly value$ = this.cva.value$
  readonly selected = computed(() => {
    return getVariableSchema(this.variables(), this.value$())
  })
  readonly group = computed(() => this.selected().group)
  readonly variable = computed(() => this.selected().variable)
  readonly variableType = computed(() => this.variable()?.type)

  readonly filteredVariables = computed(() => this.variables()?.map((_) => {
    const variables = _.variables.filter((v) => this.type() ? v.type === this.type() : true)
    if (variables.length) {
      return {
        ..._,
        variables
      }
    }
    return null
  }).filter((_) => !!_))

  constructor() {
    effect(() => {
      // console.log(this.variable())
    })
  }

  selectVariable(group: string, variable: TStateVariable) {
    this.cva.writeValue(group ? `${group}.${variable.name}` : variable.name)
  }
}
