import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  ContentChild,
  Input,
  TemplateRef,
  booleanAttribute,
  computed,
  forwardRef,
  input,
  output,
  signal
} from '@angular/core'
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms'
import {
  ZardComboboxComponent,
  ZardComboboxOptionTemplateDirective,
  type ZardComboboxOption,
  ZardFormImports,
  ZardInputDirective
} from '@xpert-ai/headless-ui'
import { DisplayDensity, ISelectOption, NgmDensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgmOptionContent } from './option-content'
import { NgmHighlightDirective } from '../directives'

/**
 * You can use the following custom elements to customize the input:
 * - ngmLabel: the custom label elements of the input
 * @deprecated use headless components instead
 */
@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    ZardComboboxComponent,
    ZardComboboxOptionTemplateDirective,
    ZardInputDirective,
    ...ZardFormImports,
    NgmHighlightDirective
  ],
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
  readonly required = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })
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

  // Outputs
  readonly blur = output<FocusEvent>()
  readonly focus = output<FocusEvent>()

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

  readonly searchTerm = signal('')
  readonly highlight = computed(() => this.searchTerm())

  private _onChange: (value) => void
  private _onTouched: (value) => void

  readonly hasOptions = computed(() => !!this.options()?.length)
  readonly comboboxOptions = computed<ZardComboboxOption[]>(() =>
    (this.options() ?? []).map((option) => ({
      id: option.key ?? option[this.valueKey],
      label: option.caption || option.label || `${option[this.valueKey] ?? ''}`,
      value: option[this.valueKey],
      data: option
    }))
  )

  writeValue(obj: any): void {
    this.value = obj ?? this.defaultValue
    this.searchTerm.set('')
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
    this.value = event
    this._onChange(this.value)
  }

  onSearchTermChange(value: string) {
    this.searchTerm.set(value)
    this.onChange(value)
  }

  onOptionSelected(value: any) {
    this.searchTerm.set('')
    this.onChange(value)
  }

  readonly filterOption = (option: ZardComboboxOption, searchTerm: string) => {
    const normalized = searchTerm?.trim().toLowerCase()
    if (!normalized) {
      return true
    }

    const original = option.data as ISelectOption | undefined
    const terms = normalized.split(' ').filter(Boolean)
    const haystack = `${original?.caption || original?.label || ''}${original?.[this.valueKey] ?? ''}`.toLowerCase()
    return terms.every((term) => haystack.includes(term))
  }

  displayValue(_option: ZardComboboxOption | null, value: unknown) {
    return value == null ? '' : `${value}`
  }
}
