import { A11yModule, FocusOrigin } from '@angular/cdk/a11y'
import { Overlay } from '@angular/cdk/overlay'
import { CommonModule } from '@angular/common'
import { booleanAttribute, Component, inject, input, output } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { TWorkflowVarGroup } from '../../../@core/types'
import { XpertVariableInputComponent } from '../../agent'

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, A11yModule, MatTooltipModule, XpertVariableInputComponent],
  selector: 'xpert-env-input',
  templateUrl: './input.component.html',
  styleUrls: ['./input.component.scss'],
  hostDirectives: [NgxControlValueAccessor],
  host: {
    tabindex: '0'
  }
})
export class XpertEnvVarInputComponent {
  protected cva = inject<NgxControlValueAccessor<string | null>>(NgxControlValueAccessor)
  readonly overlay = inject(Overlay)

  // Inputs
  readonly variables = input<TWorkflowVarGroup[]>()
  readonly placeholder = input<string>()
  readonly type = input<string>()
  readonly autocomplete = input<string>()
  readonly disabled = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  // Outputs
  readonly focus = output<void>()
  readonly blur = output<void>()

  // States
  readonly value$ = this.cva.value$

  onFocusChange(event: FocusOrigin) {
    if (event) {
      this.focus.emit()
    } else {
      this.blur.emit()
    }
  }
}
