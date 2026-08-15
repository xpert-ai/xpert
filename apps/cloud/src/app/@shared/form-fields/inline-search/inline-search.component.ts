import { Component, forwardRef } from '@angular/core'
import { ControlValueAccessor, FormControl, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms'
import { ZardSearchInputComponent } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { distinctUntilChanged } from 'rxjs'

/**
 * @deprecated use `<z-search-input />`
 */
@Component({
  standalone: true,
  imports: [ReactiveFormsModule, ZardSearchInputComponent, TranslateModule],
  selector: 'xp-inline-search',
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
