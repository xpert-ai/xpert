import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, Input, forwardRef } from '@angular/core'
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms'
import { ZardInputDirective } from '@xpert-ai/headless-ui'
import { DensityDirective } from '@metad/ocap-angular/core'
import { ColorFormat, MtxColorpickerModule } from '@ng-matero/extensions/colorpicker'
import { TranslateModule } from '@ngx-translate/core'

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TranslateModule, ZardInputDirective, MtxColorpickerModule, DensityDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ngm-color-input',
  templateUrl: './color-input.component.html',
  styleUrls: ['./color-input.component.scss'],
  inputs: ['disabled', 'color'],
  host: {
    'class': 'ngm-color-input',
    '[attr.disabled]': 'disabled || null',
    '[class.disabled]': 'disabled || null',
  },
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => NgmColorInputComponent)
    }
  ]
})
export class NgmColorInputComponent implements ControlValueAccessor {
  @Input() disabled = false
  @Input() color: string | null = null
  @Input() label: string
  @Input() default = '#00000000'
  @Input() format: ColorFormat

  value: string

  get hasColor() {
    return !!this.value
  }

  private _onChange: (value) => void
  private _onTouched: (value) => void

  writeValue(obj: any): void {
    this.value = obj
  }
  registerOnChange(fn: any): void {
    this._onChange = fn
  }
  registerOnTouched(fn: any): void {
    this._onTouched = fn
  }
  setDisabledState?(isDisabled: boolean): void {
    this.disabled = isDisabled
  }

  changeColor(value: string) {
    this._onChange?.(value)
  }

  toggleColor(event: boolean) {
    if (event) {
      this.value = this.value ?? this.default
    } else {
      this.value = null
    }
    this.changeColor(this.value)
  }
}
