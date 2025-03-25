import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { agentLabel, TStateVariable, TWorkflowVarGroup, XpertParameterTypeEnum } from '../../../@core/types'

/**
 *
 */
@Component({
  standalone: true,
  imports: [CommonModule, CdkMenuModule, FormsModule, TranslateModule, NgmI18nPipe],
  selector: 'xpert-state-variable-select',
  templateUrl: 'select.component.html',
  styleUrls: ['select.component.scss'],
  hostDirectives: [NgxControlValueAccessor]
})
export class StateVariableSelectComponent {
  eXpertParameterTypeEnum = XpertParameterTypeEnum
  agentLabel = agentLabel

  protected cva = inject<NgxControlValueAccessor<string>>(NgxControlValueAccessor)
  
  // Inputs
  readonly variables = input<TWorkflowVarGroup[]>()

  // States
  readonly group = computed(() => {
    const [group, name] = this.value$()?.startsWith('sys.') ? [this.value$()] : (this.value$()?.split('.') ?? [])
    return this.variables()?.find((_) => (name ? _.group?.name === group : !_.group?.name))
  })

  readonly variable = computed(() => {
    const [group, name] = this.value$()?.startsWith('sys.') ? [this.value$()] : (this.value$()?.split('.') ?? [])
    return this.group()?.variables.find((_) => _.name === (name ?? group))
  })

  readonly value$ = this.cva.value$

  readonly variableType = computed(() => this.variable()?.type)

  constructor() {
    effect(() => {
      // console.log(this.variables())
    })
  }

  selectVariable(group: string, variable: TStateVariable) {
    this.cva.writeValue(group ? `${group}.${variable.name}` : variable.name)
  }
}
