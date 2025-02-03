import { CommonModule } from '@angular/common'
import { booleanAttribute, Component, inject, input, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { TXpertParameter } from '../../../@core'
import { XpertParametersFormComponent } from '../parameters-form/parameters.component'

@Component({
  standalone: true,
  selector: 'xpert-parameters-card',
  templateUrl: './parameters.component.html',
  styleUrl: 'parameters.component.scss',
  imports: [CommonModule, FormsModule, TranslateModule, XpertParametersFormComponent],
  hostDirectives: [NgxControlValueAccessor]
})
export class XpertParametersCardComponent {
  public cva = inject<NgxControlValueAccessor<Partial<Record<string, unknown>> | null>>(NgxControlValueAccessor)
  readonly value = this.cva.value$

  // Inputs
  readonly parameters = input<TXpertParameter[]>()
  readonly readonly = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  // States
  readonly paramsExpanded = signal(false)

  toggleParams() {
    this.paramsExpanded.update((state) => !state)
  }
}
