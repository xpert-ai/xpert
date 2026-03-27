import { coerceBooleanProperty } from '@angular/cdk/coercion'
import { ScrollingModule } from '@angular/cdk/scrolling'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  HostBinding,
  input,
  Input,
  OnChanges,
  signal,
  SimpleChanges
} from '@angular/core'
import {
  ControlValueAccessor,
  FormControl,
  FormsModule,
  NG_VALUE_ACCESSOR,
  ReactiveFormsModule,
  ValidatorFn
} from '@angular/forms'

import {
  ZardButtonComponent,
  ZardCheckboxComponent,
  ZardComboboxComponent,
  ZardComboboxPanelTemplateDirective,
  type ZardComboboxOption,
  ZardFormImports,
  ZardIconComponent,
  ZardInputDirective,
  ZardLoaderComponent
} from '@xpert-ai/headless-ui'
import {
  DisplayDensity,
  ISelectOption,
  OcapCoreModule,
  NgmFieldAppearance,
  NgmFieldColor
} from '@metad/ocap-angular/core'
import { DisplayBehaviour } from '@metad/ocap-core'
import { isEqual } from 'lodash-es'
import { NgmDisplayBehaviourComponent } from '../../display-behaviour'

/**
 * @deprecated use headless components instead
 */
@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ngm-advanced-select',
  templateUrl: 'select.component.html',
  styleUrls: ['select.component.scss'],
  inputs: ['disabled', 'disableRipple', 'color'],
  host: {
    '[attr.disabled]': 'disabled || null'
  },
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => NgmAdvancedSelectComponent)
    }
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ScrollingModule,
    ...ZardFormImports,
    ZardCheckboxComponent,
    ZardComboboxComponent,
    ZardComboboxPanelTemplateDirective,
    ZardLoaderComponent,
    ZardIconComponent,
    ZardInputDirective,
    ZardButtonComponent,
    NgmDisplayBehaviourComponent,
    OcapCoreModule
  ]
})
export class NgmAdvancedSelectComponent implements OnChanges, ControlValueAccessor {
  @Input() disabled = false
  @Input() disableRipple = false
  @Input() color: NgmFieldColor = null

  @HostBinding('class.ngm-advanced-select') _isSelectComponent = true

  @Input() appearance: NgmFieldAppearance
  @Input() displayBehaviour: DisplayBehaviour | string
  @Input() displayDensity: DisplayDensity | string
  @Input() label: string
  @Input() placeholder: string

  @Input() validators: ValidatorFn | ValidatorFn[] | null

  readonly selectOptions = input<ISelectOption[]>([])

  @Input() get multiple(): boolean {
    return this._multiple
  }
  set multiple(value: boolean | string) {
    this._multiple = coerceBooleanProperty(value)
  }
  private _multiple = false

  @Input() get virtualScroll() {
    return this._virtualScroll
  }
  set virtualScroll(value: boolean | string) {
    this._virtualScroll = coerceBooleanProperty(value)
  }
  private _virtualScroll = false

  readonly loading = input(false)

  virtualScrollItemSize = 48

  formControl = new FormControl<string | string[] | null>(null)
  readonly selectionSignal = selectionModel<string>()
  readonly searchTerm = signal('')
  readonly selectedValues = computed(() => this.selectionSignal(), { equal: isEqual })
  readonly highlight = computed(() => this.searchTerm().trim())
  readonly isNotInitial = computed(() =>
    this.multiple ? this.selectedValues().length : !!this.formControl.value
  )

  readonly comboboxOptions = computed<ZardComboboxOption[]>(() =>
    (this.selectOptions() ?? []).map((option) => ({
      id: this.optionId(option),
      label: option.caption || option.label || `${option.key ?? option.value ?? ''}`,
      value: option.key,
      data: option
    }))
  )

  readonly filteredComboboxOptions = computed(() => {
    const text = this.highlight().toLowerCase()
    if (!text) {
      return this.comboboxOptions()
    }

    return this.comboboxOptions().filter((option) => {
      const original = option.data as ISelectOption | undefined
      return (
        original?.caption?.toLowerCase().includes(text) ||
        `${original?.key ?? ''}`.toLowerCase().includes(text)
      )
    })
  })

  readonly comboboxValue = computed(() =>
    this.multiple ? (this.selectedValues().length ? this.selectedValues() : null) : this.formControl.value
  )

  onChange: (input: any) => void
  onTouched: () => void

  ngOnChanges({ displayDensity, validators }: SimpleChanges): void {
    if (displayDensity) {
      if (this.displayDensity === DisplayDensity.compact) {
        this.virtualScrollItemSize = 30
      } else if (this.displayDensity === DisplayDensity.cosy) {
        this.virtualScrollItemSize = 36
      } else {
        this.virtualScrollItemSize = 48
      }
    }

    if (validators) {
      this.formControl.setValidators(validators.currentValue)
    }
  }

  writeValue(obj: any): void {
    if (this.multiple) {
      const values = Array.isArray(obj) ? obj : []
      this.selectionSignal.set(values)
      this.formControl.setValue(values, { emitEvent: false })
    } else {
      this.formControl.setValue(obj ?? null, { emitEvent: false })
    }
    this.searchTerm.set('')
  }

  registerOnChange(fn: any): void {
    this.onChange = fn
  }

  registerOnTouched(fn: any) {
    this.onTouched = fn
  }

  setDisabledState?(isDisabled: boolean): void {
    this.disabled = isDisabled
    isDisabled ? this.formControl.disable() : this.formControl.enable()
  }

  trackBy(i: number, item: ZardComboboxOption | ISelectOption) {
    return (item as ZardComboboxOption)?.id ?? (item as ISelectOption)?.key ?? i
  }

  readonly displayWith = (option: ZardComboboxOption | null, value: unknown) => {
    if (Array.isArray(value)) {
      return value
        .map((item) => this.resolveOptionLabel(item as string))
        .filter(Boolean)
        .join(', ')
    }

    if (option?.data) {
      const original = option.data as ISelectOption
      return original?.caption || original?.label || original?.key || `${value ?? ''}`
    }

    return this.resolveOptionLabel(value as string)
  }

  isSelect(option: ZardComboboxOption) {
    return this.selectionSignal().includes(option.value as string)
  }

  onSearchTermChange(value: string) {
    this.searchTerm.set(value)
  }

  onComboboxValueChange(value: unknown) {
    if (value !== null || !this.multiple) {
      this.searchTerm.set('')
    }

    if (this.multiple) {
      if (value === null) {
        this.clear()
      }
      return
    }

    const normalized = (value ?? null) as string | null
    this.formControl.setValue(normalized)
    this.onChange?.(normalized)
  }

  onSelect(event: boolean, option: ZardComboboxOption) {
    if (!this.multiple) {
      return
    }

    if (event) {
      this.selectionSignal.select(option.value as string)
    } else {
      this.selectionSignal.deselect(option.value as string)
    }

    const values = [...this.selectionSignal()]
    this.formControl.setValue(values)
    this.onChange?.(values)
  }

  clear() {
    this.searchTerm.set('')
    if (this.multiple) {
      this.selectionSignal.clear()
      this.formControl.setValue([])
      this.onChange?.([])
    } else {
      this.formControl.setValue(null)
      this.onChange?.(null)
    }
  }

  getErrorMessage() {
    return Object.values(this.formControl.errors ?? {}).join(', ')
  }

  private resolveOptionLabel(value: string | null | undefined): string {
    if (!value) {
      return ''
    }

    return this.selectOptions()?.find((item) => item.key === value)?.caption || value
  }

  private optionId(option: ISelectOption): string | number {
    const candidate = option.key ?? option.value
    return typeof candidate === 'string' || typeof candidate === 'number'
      ? candidate
      : `${candidate ?? ''}`
  }
}

export function selectionModel<T>() {
  const m = signal<T[]>([])
  const sig = (): T[] => {
    return m()
  }

  sig.set = (value: T[]) => {
    m.set(value)
  }

  sig.update = (fn: (value: T[]) => T[]) => {
    m.update(fn)
  }

  sig.select = (value: T) => {
    m.update((values) => (values.includes(value) ? values : [...values, value]))
  }

  sig.deselect = (value: T) => {
    m.update((values) => values.filter((v) => v !== value))
  }

  sig.clear = () => {
    m.set([])
  }

  return sig
}
