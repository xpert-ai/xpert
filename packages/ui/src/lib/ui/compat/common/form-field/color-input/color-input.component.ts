import { ChangeDetectionStrategy, Component, Input, forwardRef } from '@angular/core'
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { ZardInputDirective } from '../../../../../components'
import { DensityDirective } from '../../../core'

export type ColorInputFormat = 'hex' | 'rgba' | 'hsla' | 'hsva' | 'cmyk'

const createEmptyHexColor = (length: number) => `#${'0'.repeat(length)}`
const NATIVE_COLOR_FALLBACK = createEmptyHexColor(6)
const TRANSPARENT_COLOR_DEFAULT = createEmptyHexColor(8)

@Component({
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule, TranslateModule, ZardInputDirective, DensityDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'xp-color-input',
  templateUrl: './color-input.component.html',
  styleUrl: './color-input.component.scss',
  host: {
    class: 'xp-color-input',
    '[attr.disabled]': 'disabled || null',
    '[class.disabled]': 'disabled || null'
  },
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => XpColorInputComponent)
    }
  ]
})
export class XpColorInputComponent implements ControlValueAccessor {
  @Input() disabled = false
  @Input() color: string | null = null
  @Input() label = ''
  @Input() default = TRANSPARENT_COLOR_DEFAULT
  @Input() format: ColorInputFormat = 'hex'

  value: string | null = null

  private onChange: (value: string | null) => void = () => undefined
  private onTouched: () => void = () => undefined

  writeValue(value: string | null): void {
    this.value = value
  }

  registerOnChange(callback: (value: string | null) => void): void {
    this.onChange = callback
  }

  registerOnTouched(callback: () => void): void {
    this.onTouched = callback
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled
  }

  changeColor(value: string | null) {
    this.value = value
    this.onChange(value)
  }

  toggleColor(enabled: boolean) {
    this.changeColor(enabled ? (this.value ?? this.default) : null)
  }

  get nativeColorValue() {
    return this.normalizeColor(this.value || this.default || NATIVE_COLOR_FALLBACK)
  }

  updateFromNativeColor(event: Event) {
    const target = event.target
    if (target instanceof HTMLInputElement) {
      this.changeColor(target.value)
    }
  }

  markAsTouched() {
    this.onTouched()
  }

  private normalizeColor(value: string) {
    const normalized = value.trim()
    if (/^#[0-9a-f]{3}$/i.test(normalized)) {
      const [, red, green, blue] = normalized
      return `#${red}${red}${green}${green}${blue}${blue}`.toLowerCase()
    }
    if (/^#[0-9a-f]{6}$/i.test(normalized)) return normalized.toLowerCase()
    if (/^#[0-9a-f]{8}$/i.test(normalized)) return normalized.slice(0, 7).toLowerCase()
    if (/^#[0-9a-f]{4}$/i.test(normalized)) {
      const [, red, green, blue] = normalized
      return `#${red}${red}${green}${green}${blue}${blue}`.toLowerCase()
    }
    return NATIVE_COLOR_FALLBACK
  }
}
