import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  HostBinding,
  Input,
  ViewChild,
  forwardRef,
  output,
  signal
} from '@angular/core'
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms'
import { ZardInputDirective } from '@xpert-ai/headless-ui'
import { MatSlider, MatSliderDragEvent, MatSliderModule } from '@angular/material/slider'
import { NgmFieldColor } from "@metad/ocap-angular/core";

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
  imports: [CommonModule, FormsModule, ReactiveFormsModule, ZardInputDirective, MatSliderModule]
})
export class NgmSliderInputComponent implements ControlValueAccessor {
  @Input() disabled = false
  @Input() disableRipple = false
  @Input() color: NgmFieldColor = null
  @HostBinding('class.ngm-slider-input') _isSliderInputComponent = true

  @Input() label: string
  @Input() unit: string
  @Input() displayWith: MatSlider['displayWith']
  @Input() max: MatSlider['max']
  @Input() min: MatSlider['min']
  @Input() step: MatSlider['step']
  @Input() discrete: MatSlider['discrete']
  @Input() autoScale = false

  @ViewChild(MatSlider, { static: true }) slider!: MatSlider

  readonly changeEnd = output<number>()

  defaultDisplayWith = (value: number) => `${value}`

  private _model = signal<number | string>(null)
  get model() {
    const value = this._model()
    if (this.unit && typeof value === 'string') {
      if (value.endsWith(this.unit)) {
        const number = value.slice(0, -this.unit.length)
        return Number(number)
      }
    }
    return typeof value === 'string' ? Number(value) : value
  }

  set model(value) {
    const result = this.unit ? value + this.unit : value
    this._model.set(result)
    this.onChange?.(result)
  }

  originalMaxValue = null

  onChange: (input: any) => void
  onTouched: () => void

  ngAfterContentInit(): void {
    if (this.autoScale) {
      this.originalMaxValue = this.slider.max
      if (this.model >= this.slider.max) {
        this.slider.max = this.model * 2
      }
    }
  }

  writeValue(obj: any): void {
    if (obj) {
      this._model.set(obj)
      this.onValueChange(this.model)
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

  onSlicerEnd(event: MatSliderDragEvent) {
    this.changeEnd.emit(event.value)
    this.onValueChange(event.value)
  }

  onValueChange(value: number) {
    if (this.autoScale && this.slider) {
      if (value > this.slider.max) {
        this.slider.max = value
      } else if (value === this.slider.max) {
        this.originalMaxValue = this.originalMaxValue ?? this.slider.max
        this.slider.max = this.slider.max * 2
      } else if (this.originalMaxValue !== null && this.slider.max !== this.originalMaxValue) {
        if (value < this.originalMaxValue) {
          this.slider.max = this.originalMaxValue
        } else if (value < this.slider.max / 2) {
          this.slider.max = this.slider.max / 2
        }
      }
    }
  }
}
