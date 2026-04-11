
import { ScrollingModule } from '@angular/cdk/scrolling'
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  isSignal,
  OnInit,
  signal
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { NgmDisplayBehaviourComponent } from '@xpert-ai/ocap-angular/common'
import { ISelectOption } from '@xpert-ai/ocap-angular/core'
import { FieldType, FormlyModule } from '@ngx-formly/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { isString } from 'lodash-es'
import { EMPTY, Observable, catchError, isObservable, startWith } from 'rxjs'
import {
  ZardComboboxDeprecatedComponent,
  ZardComboboxDeprecatedPanelTemplateDirective,
  type ZardComboboxDeprecatedOption
} from '@xpert-ai/headless-ui/components/combobox-deprecated'
import { ZardFormImports } from '@xpert-ai/headless-ui/components/form'
import { ZardLoaderComponent } from '@xpert-ai/headless-ui/components/loader'
import { ZardSelectImports } from '@xpert-ai/headless-ui/components/select'
import { ZardTooltipImports } from '@xpert-ai/headless-ui/components/tooltip'

const isNonNullable = <T>(value: T | null | undefined): value is T => value !== null && value !== undefined

/**
 * Props:
 * - help: string, the help link, will be displayed as a link in the label
 * - info: string, the info text, will be displayed as a tooltip in the subfix
 * @deprecated default use 'key' as the key field of select option, don't specify the `valueKey` in `props`
 */
@Component({
  standalone: true,
  selector: 'pac-formly-select',
  templateUrl: `select.type.html`,
  styleUrls: [`select.type.scss`],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'pac-formly-select'
  },
  imports: [
    FormsModule,
    ReactiveFormsModule,
    ScrollingModule,
    ...ZardFormImports,
    ...ZardSelectImports,
    ...ZardTooltipImports,
    ZardComboboxDeprecatedComponent,
    ZardComboboxDeprecatedPanelTemplateDirective,
    ZardLoaderComponent,
    NgmDisplayBehaviourComponent,
    FormlyModule,
    TranslateModule
  ]
})
export class PACFormlySelectComponent extends FieldType implements OnInit {
  readonly #translate = inject(TranslateService)
  readonly #destroyRef = inject(DestroyRef)
  private skipNextSearchTermChange = false

  get valueFormControl() {
    return this.formControl as FormControl
  }

  readonly selectOptions = signal<ISelectOption[] | null>(null)
  readonly value = signal<unknown>(null)
  readonly loadError = signal<string | null>(null)
  readonly error = signal<string | null>(null)
  readonly searchTerm = signal('')
  readonly highlight = computed(() => this.searchTerm())
  readonly comboboxOptions = computed<ZardComboboxDeprecatedOption[]>(() =>
    (this.selectOptions() ?? []).map((option) => ({
      id: this.optionId(option),
      label: this.optionLabel(option),
      value: this.optionValue(option),
      data: option
    }))
  )
  readonly filteredComboboxOptions = computed(() => {
    const text = this.highlight().trim().toLowerCase()
    if (!text) {
      return this.comboboxOptions()
    }

    const terms = text.split(' ').filter(Boolean)
    return this.comboboxOptions().filter((option) => {
      const original = option.data as ISelectOption | undefined
      const value = this.optionValue(original)
      const haystack = `${this.optionLabel(original)}${value ?? ''}`.toLowerCase()
      return terms.every((term) => haystack.includes(term))
    })
  })

  #validatorEffectRef = effect(
    () => {
      const fieldError = isSignal(this.props.error) ? this.props.error() : this.props.error
      if (isString(fieldError)) {
        this.error.set(fieldError)
      } else if (this.loadError()) {
        this.error.set(this.loadError())
      } else if (
        isNonNullable(this.value()) &&
        isNonNullable(this.selectOptions()) &&
        !this.selectOptions().find((option) => this.optionValue(option) === this.value())
      ) {
        this.error.set(
          this.#translate.instant('FORMLY.COMMON.NotFoundValue', { Default: 'Not found value: ' }) + this.value()
        )
      } else {
        this.error.set(null)
      }
    }
  )

  ngOnInit(): void {
    this.valueFormControl.valueChanges
      .pipe(startWith(this.valueFormControl.value), takeUntilDestroyed(this.#destroyRef))
      .subscribe((value) => {
        this.value.set(value)
      })

    if (isObservable(this.props?.options)) {
      this.props.options
        .pipe(
          catchError((_error) => {
            const message = this.#translate.instant('FORMLY.Select.UnableLoadOptionList', {
              Default: 'Unable to load option list'
            })
            this.loadError.set(message)
            this.valueFormControl.setErrors({
              error: message
            })
            return EMPTY
          }),
          takeUntilDestroyed(this.#destroyRef)
        )
        .subscribe((event) => {
          this.loadError.set(null)
          this.selectOptions.set(event ?? [])
        })
    } else if (this.props?.options) {
      this.loadError.set(null)
      this.selectOptions.set(this.props.options as ISelectOption[])
    }
  }

  trackByValue(index: number, item: ZardComboboxDeprecatedOption) {
    return item?.id ?? item?.value ?? index
  }

  readonly displayWith = (option: ZardComboboxDeprecatedOption | null, value: unknown) => {
    if (option?.data) {
      return this.optionLabel(option.data as ISelectOption) || (value == null ? '' : `${value}`)
    }

    return value == null ? '' : `${value}`
  }

  onSearchTermChange(value: string) {
    if (this.skipNextSearchTermChange) {
      this.skipNextSearchTermChange = false
      return
    }

    this.searchTerm.set(value)
  }

  onOptionSelected(value: unknown) {
    const normalized = value ?? null
    this.skipNextSearchTermChange = true
    this.searchTerm.set('')
    if (this.valueFormControl.value !== normalized) {
      this.valueFormControl.setValue(normalized)
    }
  }

  hasError() {
    return (
      !!this.error() ||
      !!this.formControl?.getError?.('error') ||
      (this.formControl.invalid && this.formControl.touched)
    )
  }

  optionValue(option: ISelectOption | null | undefined) {
    const key = this.props?.valueKey ?? 'value'
    return option?.[key]
  }

  optionTrackBy(option: ISelectOption) {
    return this.optionId(option)
  }

  optionLabel(option: ISelectOption | null | undefined) {
    return option?.caption || option?.label || `${this.optionValue(option) ?? ''}`
  }

  private optionId(option: ISelectOption | null | undefined): string | number {
    const candidate = option?.key ?? this.optionValue(option)
    return typeof candidate === 'string' || typeof candidate === 'number' ? candidate : `${candidate ?? ''}`
  }
}
