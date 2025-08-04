import { CdkMenuModule, CdkMenuTrigger } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { booleanAttribute, Component, computed, effect, inject, input, model, viewChild } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { XpertService } from '@cloud/app/@core'
import { myRxResource, NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { of } from 'rxjs'
import {
  agentLabel,
  getVariableSchema,
  TStateVariableType,
  TWorkflowVarGroup,
  XpertParameterTypeEnum
} from '../../../@core/types'
import { TXpertVariablesOptions, XpertVariablePanelComponent } from '../variable-panel/variable.component'

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
  readonly xpertAPI = inject(XpertService)

  // Inputs
  readonly varOptions = input<TXpertVariablesOptions>()
  readonly type = input<TStateVariableType>()
  readonly inline = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })
  readonly nullable = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  readonly trigger = viewChild('trigger', { read: CdkMenuTrigger })

  // States
  readonly variables = model<TWorkflowVarGroup[]>()
  readonly value$ = this.cva.value$
  readonly selected = computed(() => getVariableSchema(this.variables(), this.value$()))
  readonly group = computed(() => this.selected().group)
  readonly variable = computed(() => this.selected().variable)
  readonly variableType = computed(() => this.variable()?.type)

  readonly #variables = myRxResource({
    request: () => (this.variables() ? null : this.varOptions()),
    loader: ({ request }) => {
      return request ? this.xpertAPI.getNodeVariables(request) : of(null)
    }
  })
  readonly loading = computed(() => this.#variables.status() === 'loading')

  constructor() {
    effect(
      () => {
        if (this.#variables.value()) {
          this.variables.set(this.#variables.value())
        }
      },
      { allowSignalWrites: true }
    )
  }

  setVariable(variable: string) {
    this.cva.writeValue(variable)
  }
}
