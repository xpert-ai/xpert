import { CommonModule } from '@angular/common'
import { Component, HostBinding, Input, forwardRef } from '@angular/core'
import { ControlValueAccessor, FormControl, FormsModule, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms'
import { MatInputModule } from '@angular/material/input'
import { TranslateModule } from '@ngx-translate/core'


@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TranslateModule, MatInputModule],
  selector: 'ngm-search',
  templateUrl: 'search.component.html',
  styleUrls: ['search.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => NgmSearchComponent)
    }
  ],
  host: {
    class: 'ngm-search'
  }
})
export class NgmSearchComponent implements ControlValueAccessor {
  @Input() formControl: FormControl
  @Input() disabled: boolean

  @HostBinding('class.ngm-search__has-value')
  get hasValue() {
    return this._value !== null && this._value !== undefined && this._value !== ''
  }

  public _value: string
  private onChange: (value: any) => void
  private onTouched: () => void

  writeValue(obj: any): void {
    this._value = obj
  }
  registerOnChange(fn: any): void {
    this.onChange = fn
  }
  registerOnTouched(fn: any): void {
    this.onTouched = fn
  }
  setDisabledState?(isDisabled: boolean): void {
    this.disabled = isDisabled
    isDisabled ? this.formControl?.disable({ emitEvent: false }) : this.formControl?.enable({ emitEvent: false })
  }

  onValueChange(value: string) {
    this.formControl?.setValue(value)
    this.onChange(value)
  }
}
