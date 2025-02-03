import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { agentLabel, TStateVariable, TWorkflowVarGroup } from '../../../@core/types'

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
  agentLabel = agentLabel

  protected cva = inject<NgxControlValueAccessor<string>>(NgxControlValueAccessor)

  readonly variables = input<TWorkflowVarGroup[]>()

  readonly group = computed(() => {
    const [group, name] = this.value$()?.split('.') ?? []
    return this.variables()?.find((_) => (name ? _.agent?.key === group : !_.agent?.key))
  })

  readonly variable = computed(() => {
    const [group, name] = this.value$()?.split('.') ?? []
    return this.group()?.variables.find((_) => _.name === (name ?? group))
  })

  readonly value$ = this.cva.value$

  readonly variableType = computed(() => this.variable()?.type)

  selectVariable(group: string, variable: TStateVariable) {
    this.cva.writeValue(group ? `${group}.${variable.name}` : variable.name)
  }
}
