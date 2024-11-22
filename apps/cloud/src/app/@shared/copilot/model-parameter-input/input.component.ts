import { CommonModule } from '@angular/common'
import { Component, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatInputModule } from '@angular/material/input'
import { MatSelectModule } from '@angular/material/select'
import { MatSliderModule } from '@angular/material/slider'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { ParameterRule, ParameterType } from '../../../@core'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { NgmDensityDirective } from '@metad/ocap-angular/core'
import { NgxFloatUiModule } from 'ngx-float-ui'

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, MatSliderModule, MatSelectModule, MatInputModule, MatSlideToggleModule, NgmDensityDirective, NgxFloatUiModule],
  selector: 'copilot-model-parameter-input',
  templateUrl: 'input.component.html',
  styleUrls: ['input.component.scss'],
  hostDirectives: [NgxControlValueAccessor]
})
export class ModelParameterInputComponent {
  eParameterType = ParameterType

  protected cva = inject<NgxControlValueAccessor<any>>(NgxControlValueAccessor)

  readonly parameter = input<ParameterRule>()

  readonly value$ = this.cva.value$

  updateValue(value) {
    this.value$.set(value)
  }
}
