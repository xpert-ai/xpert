import { CommonModule } from '@angular/common'
import { Component, forwardRef, input } from '@angular/core'
import { ControlValueAccessor, FormControl, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms'
import { MatNativeDateModule } from '@angular/material/core'
import { MatDatepickerInputEvent, MatDatepickerModule } from '@angular/material/datepicker'
import { MatInputModule } from '@angular/material/input'
import { OcapCoreModule } from '@metad/ocap-angular/core'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDatepickerModule,
    MatInputModule,
    MatNativeDateModule,
    OcapCoreModule,
  ],
  selector: 'ngm-datepicker',
  templateUrl: './datepicker.component.html',
  styleUrls: ['./datepicker.component.scss'],
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
  
  date = new FormControl(new Date())

  /**
   * Invoked when the model has been changed
   */
  onChange: (_: any) => void = (_: any) => {}
  /**
   * Invoked when the model has been touched
   */
  onTouched: () => void = () => {}

  writeValue(obj: any): void {
    this.date.setValue(obj)
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

  onDateChange(event: MatDatepickerInputEvent<any>) {
    this.onChange(event.value)
  }
}
