import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  ContentChild,
  Input,
  TemplateRef,
  booleanAttribute,
  forwardRef,
  input,
  output,
  signal
} from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import { ControlValueAccessor, FormControl, FormsModule, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms'
import { MatAutocompleteModule } from '@angular/material/autocomplete'
import { MatInputModule } from '@angular/material/input'
import { DisplayDensity, ISelectOption, NgmDensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { map, startWith, switchMap } from 'rxjs'
import { NgmOptionContent } from './option-content'
import { NgmHighlightDirective } from '../directives'

/**
 * You can use the following custom elements to customize the input:
 * - ngmLabel: the custom label elements of the input
 * @deprecated use headless components instead
 */
@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TranslateModule, MatInputModule, MatAutocompleteModule, NgmHighlightDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ngm-input',
  templateUrl: './input.component.html',
  styleUrls: ['./input.component.scss'],
  hostDirectives: [
    {
      directive: NgmDensityDirective,
      inputs: ['small', 'large'],
    }
  ],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => NgmInputComponent)
    }
  ]
})
export class NgmInputComponent implements ControlValueAccessor {
  readonly label = input<string>()
  readonly placeholder = input<string>()
  readonly type = input<string>(null)
  @Input() defaultValue = null
  @Input() valueKey = 'value'
  readonly displayDensity = input<DisplayDensity | string>()

  readonly options = input<ISelectOption[]>()

  readonly disabled = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })
  readonly _disabled = signal(false)

  readonly simple = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  readonly blur = output<FocusEvent>()

  /**
   * Template provided in the tab content that will be used if present, used to enable lazy-loading
   */
  @ContentChild(NgmOptionContent, { read: TemplateRef, static: true })
  // We need an initializer here to avoid a TS error. The value will be set in `ngAfterViewInit`.
  _explicitContent: TemplateRef<any> = undefined!

  get value() {
    return this._value()
  }
  set value(value) {
    this._value.set(value)
  }
  private readonly _value = signal(null)

  readonly searchControl = new FormControl()
  get highlight() {
    return this.searchControl.value
  }

  private _onChange: (value) => void
  private _onTouched: (value) => void

  readonly options$ = toObservable(this.options).pipe(
    switchMap((options) =>
      this.searchControl.valueChanges.pipe(
        startWith(''),
        map((text) => {
          text = typeof text === 'string' ? text?.trim().toLowerCase() : `${text || ''}`
          if (text && options) {
            const terms = text.split(' ').filter((t) => !!t)
            return options.filter((option) => {
              const str = `${option.caption || option.label || ''}${option[this.valueKey]}`
              return terms.every((term) => str?.toLowerCase().includes(term))
            })
          }
          return options
        })
      )
    )
  )

  writeValue(obj: any): void {
    this.value = obj ?? this.defaultValue
  }
  registerOnChange(fn: any): void {
    this._onChange = fn
  }
  registerOnTouched(fn: any): void {
    this._onTouched = fn
  }
  setDisabledState?(isDisabled: boolean): void {
    this._disabled.set(isDisabled)
  }

  onChange(event) {
    this.searchControl.setValue(event)
    this.value = event
    this._onChange(this.value)
  }

  onOptionSelected(event) {
    this.searchControl.setValue(null)
  }
}
