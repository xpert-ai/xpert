import { ScrollingModule } from '@angular/cdk/scrolling'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  ContentChild,
  HostBinding,
  TemplateRef,
  booleanAttribute,
  computed,
  forwardRef,
  input,
  signal,
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import {
  ControlValueAccessor,
  FormControl,
  FormsModule,
  NG_VALUE_ACCESSOR,
  ReactiveFormsModule,
} from '@angular/forms'
import {
  ZardComboboxDeprecatedComponent,
  ZardComboboxDeprecatedPanelTemplateDirective,
  type ZardComboboxDeprecatedOption,
  ZardFormImports,
  ZardIconComponent,
  ZardInputDirective,
  ZardSelectImports
} from '@xpert-ai/headless-ui'
import { DisplayDensity, ISelectOption, NgmDensityDirective, OcapCoreModule } from '@xpert-ai/ocap-angular/core'
import { DisplayBehaviour } from '@xpert-ai/ocap-core'
import { distinctUntilChanged, filter } from 'rxjs/operators'
import { NgmDisplayBehaviourComponent } from '../../display-behaviour'
import { NgmOptionContent } from '../../input/option-content'

/**
 * Shared select wrapper for flat option lists.
 * You can use the following custom elements to customize the select:
 * - ngmLabel: the custom label elements of the select
 * - ngmError: the custom error message of the select
 * - ngmSuffix: the custom suffix elements of the select
 */
@Component({
  standalone: true,
  selector: 'ngm-select',
  templateUrl: `select.component.html`,
  styleUrls: [`select.component.scss`],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'ngm-select',
    '[attr.disabled]': 'isDisabled || null'
  },
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
      useExisting: forwardRef(() => NgmSelectComponent)
    }
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ...ZardSelectImports,
    ZardComboboxDeprecatedComponent,
    ZardComboboxDeprecatedPanelTemplateDirective,
    ZardInputDirective,
    ...ZardFormImports,
    ZardIconComponent,
    ScrollingModule,

    OcapCoreModule,
    NgmDisplayBehaviourComponent,
  ]
})
export class NgmSelectComponent implements ControlValueAccessor
{
  readonly displayBehaviour = input<DisplayBehaviour | string>()
  readonly displayDensity = input<DisplayDensity | string>()
  /**
   * The name of key field of option 
   */
  readonly valueKey = input<'value' | 'key' | string>('value')
  readonly label = input<string>()
  readonly placeholder = input<string>()
  readonly required = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  readonly searchable = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })
  readonly virtualScroll = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })

  // readonly validators = input<ValidatorFn | ValidatorFn[] | null>()

  readonly multiple = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })

  readonly selectOptions = input<Array<ISelectOption>>()
  readonly panelWidth = input<string | number | null>(null)
  readonly allowInput = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })

  @ContentChild(NgmOptionContent, { read: TemplateRef, static: true })
  _explicitContent: TemplateRef<any> = undefined!

  formControl = new FormControl<string | number | Array<string | number>>(null)
  readonly value = signal<string | number | Array<string | number>>(null)
  readonly searchTerm = signal('')
  readonly highlight = computed(() => this.searchTerm())
  readonly comboboxOptions = computed<ZardComboboxDeprecatedOption[]>(() =>
    (this.selectOptions() ?? []).map((option) => ({
      id: this.optionId(option),
      label: option.caption || option.label || `${option[this.valueKey()] ?? ''}`,
      value: option[this.valueKey()],
      data: option
    }))
  )
  readonly filteredComboboxOptions = computed(() => {
    const text = this.highlight()?.trim().toLowerCase()
    if (!text) {
      return this.comboboxOptions()
    }

    const terms = text.split(' ').filter(Boolean)
    return this.comboboxOptions().filter((option) => {
      const original = option.data as ISelectOption | undefined
      const str = `${original?.caption || original?.label || ''}${original?.[this.valueKey()] ?? ''}`.toLowerCase()
      return terms.every((term) => str.includes(term))
    })
  })

  readonly inputDirty = signal(false)

  onChange: (input: any) => void
  onTouched: () => void
  private skipNextSearchTermChange = false

  private valueSub = this.formControl.valueChanges
    .pipe(
      distinctUntilChanged(),
      takeUntilDestroyed()
    )
    .subscribe((value) => {
      this.value.set(value)
      this.onChange?.(value)
    })

  writeValue(obj: any): void {
    this.value.set(obj)
    this.formControl.setValue(obj, { emitEvent: false })
    this.searchTerm.set('')
  }
  registerOnChange(fn: any): void {
    this.onChange = fn
  }
  registerOnTouched(fn: any) {
    this.onTouched = fn
  }
  setDisabledState?(isDisabled: boolean): void {
    if (isDisabled) {
      this.formControl.disable()
    } else {
      this.formControl.enable()
    }
  }
  trackByValue(index: number, item) {
    return item?.id ?? item?.value
  }

  displayWith(option: ZardComboboxDeprecatedOption | null, value: unknown) {
    if (option?.data) {
      const original = option.data as ISelectOption
      return original?.caption || original?.label || original?.key || `${value ?? ''}`
    }

    return value == null ? '' : `${value}`
  }

  onSearchTermChange(value: string) {
    if (this.skipNextSearchTermChange) {
      this.skipNextSearchTermChange = false
      return
    }

    this.inputDirty.set(true)
    this.searchTerm.set(value)
  }

  onOptionSelected(value: unknown) {
    this.inputDirty.set(false)
    this.skipNextSearchTermChange = true
    this.searchTerm.set('')
    this.formControl.setValue((value ?? null) as string | number | null)
  }

  clear() {
    this.formControl.setValue(null)
    this.searchTerm.set('')
  }

  @HostBinding('attr.disabled')
  get isDisabled() {
    return this.formControl.disabled
  }

  private optionId(option: ISelectOption): string | number {
    const candidate = option.key ?? option[this.valueKey()]
    return typeof candidate === 'string' || typeof candidate === 'number'
      ? candidate
      : `${candidate ?? ''}`
  }
}
