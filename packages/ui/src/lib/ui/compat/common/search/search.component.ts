import { Component, HostBinding, Input, forwardRef, signal } from '@angular/core'
import { ControlValueAccessor, FormControl, FormsModule, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms'
import { ZardInputDirective } from '../../../../components'
import { DisplayDensity } from '../../core'
import { TranslateModule } from '@ngx-translate/core'

/**
 * @deprecated use headless components instead
 */
@Component({
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule, TranslateModule, ZardInputDirective],
  selector: 'xp-search',
  templateUrl: 'search.component.html',
  styleUrls: ['search.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => XpSearchComponent)
    }
  ],
  host: {
    class: 'xp-search'
  }
})
export class XpSearchComponent implements ControlValueAccessor {
  @Input() formControl: FormControl
  @Input() disabled: boolean

  @Input() get displayDensity(): string {
    return this.displayDensity$()
  }
  set displayDensity(value) {
    this.displayDensity$.set(DisplayDensity[value])
  }
  readonly displayDensity$ = signal<DisplayDensity>(null)

  @HostBinding('class.xp-search__has-value')
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
    this.onChange?.(value)
  }

  clear() {
    this.onValueChange('')
    this._value = null
  }
}
