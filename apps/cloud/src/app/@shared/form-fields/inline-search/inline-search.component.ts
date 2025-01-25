import { CommonModule } from '@angular/common'
import { Component, forwardRef } from '@angular/core'
import { ControlValueAccessor, FormControl, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms'
import { MatInputModule } from '@angular/material/input'
import { TranslateModule } from '@ngx-translate/core'
import { distinctUntilChanged } from 'rxjs'

/**
 * @deprecated use `<ngm-search />`
 */
@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatInputModule, TranslateModule],
  selector: 'pac-inline-search',
  templateUrl: 'inline-search.component.html',
  styleUrls: ['inline-search.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => InlineSearchComponent)
    }
  ]
})
export class InlineSearchComponent implements ControlValueAccessor {
  searchControl = new FormControl()

  _onChange: (value: string[]) => void
  constructor() {
    this.searchControl.valueChanges.pipe(distinctUntilChanged()).subscribe((value) => {
      this._onChange?.(value)
    })
  }

  writeValue(obj: any): void {
    if (obj) {
      this.searchControl.setValue(obj)
    }
  }
  registerOnChange(fn: any): void {
    this._onChange = fn
  }
  registerOnTouched(fn: any): void {}
  setDisabledState?(isDisabled: boolean): void {
    isDisabled ? this.searchControl.disable() : this.searchControl.enable()
  }
}
