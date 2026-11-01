import { Component, computed, forwardRef, input, signal } from '@angular/core'
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms'
import { ZardSelectImports, ZardInputDirective, ZardSliderComponent, ZardSwitchComponent } from '@xpert-ai/headless-ui'
import { isOutputTokenParameter, ParameterRule, ParameterType } from '@xpert-ai/contracts'

/**
 * @todo Use JSON Schema to implement
 */
@Component({
  standalone: true,
  imports: [...ZardSelectImports, FormsModule, ZardInputDirective, ZardSliderComponent, ZardSwitchComponent],
  selector: 'copilot-model-parameter-input',
  templateUrl: 'input.component.html',
  styleUrls: ['input.component.scss'],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => ModelParameterInputComponent), multi: true }],
  host: { '(focusout)': 'onTouched()' }
})
export class ModelParameterInputComponent implements ControlValueAccessor {
  eParameterType = ParameterType

  readonly parameter = input<ParameterRule>()

  readonly value$ = signal<unknown>(null)
  readonly numericValue = computed(() => this.finiteNumber(this.value$()))
  readonly disabled = signal(false)
  private onChange: (value: unknown) => void = () => undefined
  onTouched: () => void = () => undefined

  writeValue(value: unknown) {
    this.value$.set(value)
  }
  registerOnChange(fn: (value: unknown) => void) {
    this.onChange = fn
  }
  registerOnTouched(fn: () => void) {
    this.onTouched = fn
  }
  setDisabledState(disabled: boolean) {
    this.disabled.set(disabled)
  }

  updateValue(value: unknown) {
    this.value$.set(value)
    // Commit synchronously before a blur-triggered Save click.
    this.onChange(value)
  }

  updateNumericValue(value: unknown, type: ParameterType.FLOAT | ParameterType.INT) {
    this.updateValue(this.normalizeNumericValue(value, type) ?? null)
  }

  numericStep(): number {
    const precision = this.parameter()?.precision
    if (typeof precision !== 'number' || !Number.isFinite(precision) || precision < 0) return 0.01
    // Rules use decimal places; older common rules specify the fractional step directly.
    return precision > 0 && precision < 1 ? precision : 10 ** -precision
  }

  sliderMaximum(): number | undefined {
    const parameter = this.parameter()
    const configuredMax = this.finiteNumber(parameter?.max)
    if (!isOutputTokenParameter(parameter) || configuredMax === undefined) {
      return configuredMax
    }

    const currentValue = this.finiteNumber(this.value$())
    if (currentValue === undefined) {
      return configuredMax
    }

    return Math.max(configuredMax, currentValue)
  }

  private normalizeNumericValue(value: unknown, type: ParameterType.FLOAT | ParameterType.INT): number | undefined {
    if (value === '' || value === null || value === undefined) {
      return undefined
    }

    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : undefined
    }

    if (typeof value === 'string') {
      const parsed = type === ParameterType.INT ? Number.parseInt(value, 10) : Number.parseFloat(value)
      return Number.isFinite(parsed) ? parsed : undefined
    }

    return undefined
  }

  private finiteNumber(value: unknown): number | undefined {
    const numericValue = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
    return Number.isFinite(numericValue) ? numericValue : undefined
  }
}
