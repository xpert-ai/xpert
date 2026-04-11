
import { ChangeDetectionStrategy, Component, Input, forwardRef } from '@angular/core'
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms'
import { ZardInputDirective } from '@xpert-ai/headless-ui'
import { DensityDirective } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'

export type ColorInputFormat = 'hex' | 'rgba' | 'hsla' | 'hsva' | 'cmyk'

@Component({
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule, TranslateModule, ZardInputDirective, DensityDirective],
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
  @Input() format: ColorInputFormat = 'hex'

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
    this.value = value
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

  get nativeColorValue() {
    return this.normalizeColor(this.value || this.default || '#000000')
  }

  updateFromNativeColor(value: string) {
    this.changeColor(value)
  }

  private normalizeColor(value: string) {
    const normalized = `${value || ''}`.trim()
    if (/^#[0-9a-f]{3}$/i.test(normalized)) {
      const [, r, g, b] = normalized
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
    }

    if (/^#[0-9a-f]{6}$/i.test(normalized)) {
      return normalized.toLowerCase()
    }

    if (/^#[0-9a-f]{8}$/i.test(normalized)) {
      return normalized.slice(0, 7).toLowerCase()
    }

    if (/^#[0-9a-f]{4}$/i.test(normalized)) {
      const [, r, g, b] = normalized
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
    }

    return '#000000'
  }
}
