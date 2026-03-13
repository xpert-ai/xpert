import { CommonModule } from '@angular/common'
import { Component, forwardRef, input } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { ControlValueAccessor, FormControl, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms'
import { ZardDatePickerComponent } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ZardDatePickerComponent,
  ],
  selector: 'ngm-datepicker',
  templateUrl: './datepicker.component.html',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => NgmDatepickerComponent),
      multi: true
    }
  ]
})
export class NgmDatepickerComponent implements ControlValueAccessor {

  readonly label = input<string>('')
 
  date = new FormControl<Date | null>(null)

  /**
   * Invoked when the model has been changed
   */
  onChange: (_: any) => void = (_: any) => {}
  /**
   * Invoked when the model has been touched
   */
  onTouched: () => void = () => {}

  constructor() {
    this.date.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      this.onChange(value)
      this.onTouched()
    })
  }

  writeValue(obj: any): void {
    this.date.setValue(obj, { emitEvent: false })
  }
  registerOnChange(fn: any): void {
    this.onChange = fn
  }
  registerOnTouched(fn: any): void {
    this.onTouched = fn
  }
  setDisabledState?(isDisabled: boolean): void {
    isDisabled ? this.date.disable() : this.date.enable()
  }
}
