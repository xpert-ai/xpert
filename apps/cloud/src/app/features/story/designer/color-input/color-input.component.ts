import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, Input, forwardRef, signal } from '@angular/core'
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { NgmColorInputComponent } from '@metad/components/form-field'
import { MaterialModule } from '../../../../@shared/material.module'
import { DensityDirective } from '@metad/ocap-angular/core'

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TranslateModule, MaterialModule, NgmColorInputComponent, DensityDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pac-color-input',
  templateUrl: './color-input.component.html',
  styleUrls: ['./color-input.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => ColorInputComponent)
    }
  ]
})
export class ColorInputComponent implements ControlValueAccessor {
  @Input() label: string
  @Input() default = '#00000000'

  public readonly value = signal<string | null>(null)

  get hasColor() {
    return !!this.value()
  }

  private _onChange: (value) => void
  private _onTouched: (value) => void

  writeValue(obj: any): void {
    this.value.set(obj)
  }
  registerOnChange(fn: any): void {
    this._onChange = fn
  }
  registerOnTouched(fn: any): void {
    this._onTouched = fn
  }
  setDisabledState?(isDisabled: boolean): void {}

  changeColor(value: string) {
    this.value.set(value)
    this._onChange?.(value)
  }

  toggleColor(event: boolean) {
    if (event) {
      this.value.set(this.value() ?? this.default)
    } else {
      this.value.set(null)
    }
    this.changeColor(this.value())
  }
}
