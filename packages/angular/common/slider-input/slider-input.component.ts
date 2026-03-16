
import { ChangeDetectionStrategy, Component, HostBinding, Input, OnChanges, forwardRef, output, signal } from '@angular/core'
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms'
import { ZardInputDirective, ZardSliderComponent } from '@xpert-ai/headless-ui'
import type { ZardSliderValue } from '@xpert-ai/headless-ui'
import { NgmFieldColor } from '@metad/ocap-angular/core'

/**
 * @deprecated use headless components instead
 */
@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ngm-slider-input',
  templateUrl: 'slider-input.component.html',
  styleUrls: ['slider-input.component.scss'],
  inputs: ['disabled', 'disableRipple', 'color'],
  host: {
    '[attr.disabled]': 'disabled || null'
  },
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => NgmSliderInputComponent)
    }
  ],
  imports: [FormsModule, ReactiveFormsModule, ZardInputDirective, ZardSliderComponent]
})
export class NgmSliderInputComponent implements ControlValueAccessor, OnChanges {
  @Input() disabled = false
  @Input() disableRipple = false
  @Input() color: NgmFieldColor = null
  @HostBinding('class.ngm-slider-input') _isSliderInputComponent = true

  @Input() label: string
  @Input() unit: string
  @Input() displayWith: (value: number) => string
  @Input() max: number = 100
  @Input() min: number = 0
  @Input() step: number = 1
  @Input() discrete: boolean = false
  @Input() showTickMarks: boolean = false
  @Input() autoScale = false

  readonly changeEnd = output<number>()

  readonly currentMax = signal(100)

  defaultDisplayWith = (value: number) => `${value}`

  private _model = signal<number | string | null>(null)
  private originalMaxValue: number | null = null

  get model(): number | null {
    const value = this._model()
    if (this.unit && typeof value === 'string' && value.endsWith(this.unit)) {
      return Number(value.slice(0, -this.unit.length))
    }
    return value == null ? null : typeof value === 'string' ? Number(value) : value
  }

  set model(value: number | string) {
    const numericValue = value == null || value === '' ? null : Number(value)
    const result = this.unit && numericValue != null ? `${numericValue}${this.unit}` : numericValue
    this._model.set(result)
    this.onChange?.(result)
  }

  onChange: (input: any) => void
  onTouched: () => void

  ngOnChanges(): void {
    const normalizedMax = this.normalizeNumber(this.max, 100)
    const model = this.model
    this.originalMaxValue = normalizedMax

    if (!this.autoScale || this.currentMax() < normalizedMax) {
      this.currentMax.set(normalizedMax)
    }

    if (this.autoScale && model != null && model >= normalizedMax) {
      this.currentMax.set(this.expandMax(model))
    }
  }

  writeValue(obj: any): void {
    if (obj !== undefined) {
      this._model.set(obj)
      const model = this.model
      if (model != null) {
        this.onValueChange(model)
      }
    }
  }

  registerOnChange(fn: any): void {
    this.onChange = fn
  }

  registerOnTouched(fn: any) {
    this.onTouched = fn
  }

  setDisabledState?(isDisabled: boolean): void {
    this.disabled = isDisabled
  }

  onSliderValueChange(value: ZardSliderValue) {
    const numericValue = this.sliderValue(value)
    this.model = numericValue
    this.onValueChange(numericValue)
  }

  onSliderChangeEnd(value: ZardSliderValue) {
    const numericValue = this.sliderValue(value)
    this.changeEnd.emit(numericValue)
    this.onTouched?.()
    this.onValueChange(numericValue)
  }

  onInputBlur() {
    this.changeEnd.emit(this.model ?? this.min)
    this.onTouched?.()
  }

  onValueChange(value: number) {
    if (!this.autoScale || value == null) {
      if (!this.autoScale) {
        this.currentMax.set(this.normalizeNumber(this.max, 100))
      }
      return
    }

    const originalMax = this.originalMaxValue ?? this.normalizeNumber(this.max, 100)
    let nextMax = this.currentMax()

    if (value > nextMax) {
      nextMax = this.expandMax(value)
    } else if (value === nextMax) {
      nextMax = this.expandMax(value)
    } else if (nextMax !== originalMax) {
      if (value < originalMax) {
        nextMax = originalMax
      } else if (value < nextMax / 2) {
        nextMax = Math.max(originalMax, nextMax / 2)
      }
    }

    this.currentMax.set(Math.max(originalMax, nextMax))
  }

  private normalizeNumber(value: number, fallback: number): number {
    return Number.isFinite(value) ? Number(value) : fallback
  }

  private expandMax(value: number): number {
    const originalMax = this.originalMaxValue ?? this.normalizeNumber(this.max, 100)
    return Math.max(originalMax, value * 2)
  }

  private sliderValue(value: ZardSliderValue): number {
    return typeof value === 'number' ? value : value[0]
  }
}
