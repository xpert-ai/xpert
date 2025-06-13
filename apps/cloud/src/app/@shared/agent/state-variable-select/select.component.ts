import { CdkMenuModule, CdkMenuTrigger } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import {
  booleanAttribute,
  Component,
  computed,
  inject,
  input,
  viewChild
} from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { agentLabel, getVariableSchema, TWorkflowVarGroup, XpertParameterTypeEnum } from '../../../@core/types'
import { XpertVariablePanelComponent } from '../variable-panel/variable.component'

/**
 *
 */
@Component({
  standalone: true,
  imports: [CommonModule, CdkMenuModule, FormsModule, TranslateModule, NgmI18nPipe, XpertVariablePanelComponent],
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
  readonly inline = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  readonly trigger = viewChild('trigger', { read: CdkMenuTrigger })

  // States
  readonly value$ = this.cva.value$
  readonly selected = computed(() => getVariableSchema(this.variables(), this.value$()))
  readonly group = computed(() => this.selected().group)
  readonly variable = computed(() => this.selected().variable)
  readonly variableType = computed(() => this.variable()?.type)

  setVariable(variable: string) {
    this.cva.writeValue(variable)
  }
}
