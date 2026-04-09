import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { NgmHighlightDirective } from '@metad/ocap-angular/common'
import { ISelectOption } from '@metad/ocap-angular/core'
import { FieldType, FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { isObservable, startWith } from 'rxjs'
import {
  ZardComboboxDeprecatedComponent,
  ZardComboboxDeprecatedOptionTemplateDirective,
  type ZardComboboxDeprecatedOption
} from '@xpert-ai/headless-ui/components/combobox-deprecated'
import { ZardFormImports } from '@xpert-ai/headless-ui/components/form'
import { ZardInputDirective } from '@xpert-ai/headless-ui/components/input'

@Component({
  standalone: true,
  selector: 'pac-formly-input',
  templateUrl: `input.type.html`,
  styleUrls: [`input.type.scss`],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'pac-formly-input'
  },
  imports: [
    TranslateModule,
    ZardComboboxDeprecatedComponent,
    ZardComboboxDeprecatedOptionTemplateDirective,
    ZardInputDirective,
    NgmHighlightDirective,
    ...ZardFormImports,
    FormlyModule
  ]
})
export class PACFormlyInputComponent extends FieldType implements OnInit {
  readonly #destroyRef = inject(DestroyRef)

  readonly selectOptions = signal<ISelectOption[]>([])
  readonly searchTerm = signal('')

  readonly hasOptions = computed(() => !!this.selectOptions().length)
  readonly comboboxOptions = computed<ZardComboboxDeprecatedOption<unknown, ISelectOption>[]>(() =>
    this.selectOptions().map((option) => ({
      id: this.optionId(option),
      label: this.optionLabel(option),
      value: this.optionValue(option),
      data: option
    }))
  )

  oldValue: unknown = null
  newValue: unknown = null

  ngOnInit(): void {
    this.formControl.valueChanges.pipe(startWith(this.formControl.value), takeUntilDestroyed(this.#destroyRef)).subscribe((value) => {
      this.oldValue = value
      this.newValue = value
      this.searchTerm.set('')
    })

    if (isObservable(this.props?.options)) {
      this.props.options.pipe(takeUntilDestroyed(this.#destroyRef)).subscribe((options) => {
        this.selectOptions.set(options)
      })
    } else {
      this.selectOptions.set(this.props?.options ?? [])
    }

    if (this.props?.readonly) {
      this.formControl.disable()
    }
  }

  onSearchTermChange(value: string) {
    this.searchTerm.set(value)
    this.newValue = value
  }

  onOptionSelected(value: unknown) {
    this.searchTerm.set('')
    this.newValue = value
  }

  onTextInput(event: Event) {
    const target = event.target
    if (target instanceof HTMLInputElement) {
      this.newValue = target.value
    }
  }

  onFocus() {
    this.formControl.markAsTouched()
  }

  onBlur() {
    if (this.oldValue !== this.newValue) {
      this.formControl.setValue(this.newValue)
      this.formControl.markAsDirty()
    }
  }

  hasError() {
    return this.formControl.invalid && this.formControl.touched
  }

  inputStatus() {
    return this.hasError() ? 'error' : undefined
  }

  readonly filterOption = (option: ZardComboboxDeprecatedOption<unknown, ISelectOption>, searchTerm: string) => {
    const normalized = searchTerm?.trim().toLowerCase()
    if (!normalized) {
      return true
    }

    const original = option.data
    const terms = normalized.split(' ').filter(Boolean)
    const haystack = `${original?.caption || original?.label || ''}${this.optionValue(original) ?? ''}`.toLowerCase()
    return terms.every((term) => haystack.includes(term))
  }

  readonly displayValue = (_option: ZardComboboxDeprecatedOption<unknown, ISelectOption> | null, value: unknown) => {
    return value == null ? '' : `${value}`
  }

  private optionValue(option: ISelectOption | null | undefined) {
    return option?.value
  }

  private optionLabel(option: ISelectOption | null | undefined) {
    return option?.caption || option?.label || `${this.optionValue(option) ?? ''}`
  }

  private optionId(option: ISelectOption | null | undefined): string | number {
    const candidate = option?.key ?? this.optionValue(option)
    return typeof candidate === 'string' || typeof candidate === 'number' ? candidate : `${candidate ?? ''}`
  }
}
