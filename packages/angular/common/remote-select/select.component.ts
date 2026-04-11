import { CdkListboxModule, ListboxValueChangeEvent } from '@angular/cdk/listbox'
import { CdkMenuModule, CdkMenuTrigger } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { HttpClient } from '@angular/common/http'
import { booleanAttribute, Component, computed, inject, input, output } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import {
  buildListboxOptions,
  formatSelectOptionValue,
  getErrorMessage,
  hasSelectOptionValue,
  NgmI18nPipe,
  toParams,
  TSelectOption
} from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { derivedAsync } from 'ngxtension/derived-async'
import { catchError, debounceTime, of, startWith, switchMap, tap } from 'rxjs'
import { NgmHighlightDirective } from '../directives'

type TSelectOptionValue = string | { id: string }

/**
 * The value of option is primitive or object with id like `{ id: primitive, ... }`
 */
@Component({
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    CdkListboxModule,
    CdkMenuModule,
    NgmI18nPipe,
    NgmHighlightDirective
  ],
  selector: 'ngm-remote-select',
  templateUrl: 'select.component.html',
  styleUrls: ['select.component.scss'],
  hostDirectives: [NgxControlValueAccessor]
})
export class NgmRemoteSelectComponent {
  readonly httpClient = inject(HttpClient)
  protected cva =
    inject<NgxControlValueAccessor<TSelectOptionValue[] | TSelectOptionValue | null>>(NgxControlValueAccessor)
  readonly i18n = new NgmI18nPipe()

  // Inputs
  readonly url = input<string>()
  readonly params = input<Record<string, unknown>>()
  readonly multiple = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })
  readonly placeholder = input<string>()
  readonly restrict = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  // Outputs
  readonly error = output<string>()

  // States
  readonly searchControl = new FormControl()
  readonly values = computed(() => {
    if (this.multiple()) {
      return this.cva.value$() as TSelectOptionValue[]
    } else {
      return this.cva.value$() ? [this.cva.value$() as TSelectOptionValue] : []
    }
  })

  readonly selectOptions = derivedAsync(() => {
    return this.url() ? this.getSelectOptions(this.url(), this.params()) : of(null)
  })
  readonly listboxOptions = computed(() =>
    buildListboxOptions(
      this.selectOptions(),
      this.values(),
      this.compareWith,
      'Current value not found, please reselect or clear'
    )
  )

  readonly searchText = toSignal<string>(this.searchControl.valueChanges.pipe(debounceTime(300), startWith(null)))
  readonly filteredSelectOptions = computed(() => {
    const text = this.searchText()?.trim().toLowerCase()
    return text
      ? this.listboxOptions()?.filter((option) => {
          const label = this.i18n.transform(option.label)?.toLowerCase() ?? ''
          const description = this.i18n.transform(option.description)?.toLowerCase() ?? ''
          return label.includes(text)
            || description.includes(text)
            || formatSelectOptionValue(option.value).toLowerCase().includes(text)
            || hasSelectOptionValue(this.values(), option.value, this.compareWith)
        })
      : this.listboxOptions()
  })

  readonly selectedOptions = computed(() => {
    return this.values()?.map(
      (value) => this.listboxOptions()?.find((_) => this.compareWith(_.value, value)) ?? { value }
    )
  })

  readonly notFoundOption = computed(() => {
    if (this.restrict() && this.selectOptions()) {
      const notExist = this.values()?.find((value) => !this.selectOptions()?.some((_) => this.compareWith(_.value, value)))
      return notExist
    }
    return null
  })

  getSelectOptions(url: string, params: Record<string, unknown>) {
    return of(true).pipe(
      tap(() => this.error.emit(null)),
      switchMap(() => this.httpClient.get<TSelectOption<TSelectOptionValue>[]>(url, { params: params ? toParams(params) : null })),
      catchError((err) => {
        this.error.emit(getErrorMessage(err))
        return of(null)
      })
    )
  }

  selectValues(event: ListboxValueChangeEvent<TSelectOptionValue>) {
    if (this.multiple()) {
      this.cva.value$.set([...event.value])
    } else {
      this.cva.value$.set(event.value[0] ?? null)
    }
  }

  checkedWith(value: TSelectOptionValue) {
    return this.values()?.some((_) => this.compareWith(_, value))
  }

  compareWith(a: TSelectOptionValue, b: TSelectOptionValue) {
    if (typeof a === 'object' && typeof b === 'object') {
      return a.id === b.id
    } else {
      return a === b
    }
  }

  selectOption(trigger: CdkMenuTrigger, value: any) {
    if (!this.multiple()) {
      trigger.close()
    }
  }

  clear() {
    this.cva.writeValue(this.multiple() ? [] : null)
  }
}
