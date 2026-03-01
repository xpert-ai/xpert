import { CdkListboxModule, ListboxValueChangeEvent } from '@angular/cdk/listbox'
import { CdkMenuModule, CdkMenuTrigger } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { HttpClient } from '@angular/common/http'
import { booleanAttribute, Component, computed, inject, input, output } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { NgmHighlightDirective } from '@metad/ocap-angular/common'
import { getErrorMessage, NgmI18nPipe, TSelectOption } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { derivedAsync } from 'ngxtension/derived-async'
import { catchError, of, startWith, switchMap, tap, debounceTime } from 'rxjs'
import { TWorkflowVarGroup } from '../../../@core/types'
import { expandVariablesWithItems } from '../../agent/types'
import { toParams } from '@metad/core'

type TSelectOptionValue = string | { id: string }

/**
 * Remote select field with optional LangGraph state-variable options.
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
  selector: 'xpert-remote-select',
  templateUrl: 'select.component.html',
  styleUrls: ['select.component.scss'],
  hostDirectives: [NgxControlValueAccessor]
})
export class XpertRemoteSelectComponent {
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
  readonly variable = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })
  readonly variables = input<TWorkflowVarGroup[] | null>()

  // Outputs
  readonly error = output<string>()

  // States
  readonly searchControl = new FormControl()
  readonly values = computed(() => {
    if (this.multiple()) {
      return this.cva.value$() as TSelectOptionValue[]
    }
    return this.cva.value$() ? [this.cva.value$() as TSelectOptionValue] : []
  })

  readonly remoteOptions = derivedAsync(() => {
    return this.url() ? this.getSelectOptions(this.url(), this.params()) : of([])
  })

  readonly variableOptions = computed<TSelectOption<TSelectOptionValue>[]>(() => {
    if (!this.variable() || !this.variables()?.length) {
      return []
    }
    return toVariableOptions(this.variables())
  })

  readonly selectOptions = computed<TSelectOption<TSelectOptionValue>[]>(() => {
    const options = [...this.variableOptions(), ...(this.remoteOptions() ?? [])]
    const deduped: TSelectOption<TSelectOptionValue>[] = []

    for (const option of options) {
      if (!deduped.some((item) => this.compareWith(item.value, option.value))) {
        deduped.push(option)
      }
    }

    return deduped
  })

  readonly searchText = toSignal<string>(
    this.searchControl.valueChanges.pipe(debounceTime(300), startWith(null))
  )

  readonly filteredSelectOptions = computed(() => {
    const text = this.searchText()?.trim().toLowerCase()
    return text
      ? this.selectOptions()?.filter((_) => {
          const label = this.i18n.transform(_.label)?.toLowerCase() ?? ''
          const description = this.i18n.transform(_.description)?.toLowerCase() ?? ''
          return label.includes(text) || description.includes(text)
        })
      : this.selectOptions()
  })

  readonly selectedOptions = computed(() => {
    return this.values()?.map(
      (value) => this.selectOptions()?.find((_) => this.compareWith(_.value, value)) ?? { value }
    )
  })

  readonly notFoundOption = computed(() => {
    if (this.restrict() && this.selectOptions()) {
      const notExist = this.values()?.find(
        (value) => !this.selectOptions()?.some((_) => this.compareWith(_.value, value))
      )
      return notExist
    }
    return null
  })

  getSelectOptions(url: string, params: Record<string, unknown>) {
    return of(true).pipe(
      tap(() => this.error.emit(null)),
      switchMap(() =>
        this.httpClient.get<TSelectOption<TSelectOptionValue>[]>(url, {
          params: params ? toParams(params) : null
        })
      ),
      catchError((err) => {
        this.error.emit(getErrorMessage(err))
        return of([])
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
    }
    return a === b
  }

  selectOption(trigger: CdkMenuTrigger) {
    if (!this.multiple()) {
      trigger.close()
    }
  }

  clear() {
    this.cva.writeValue(this.multiple() ? [] : null)
  }

  isVariableOption(option: TSelectOption<TSelectOptionValue>) {
    return String(option?.key ?? '').startsWith('var:')
  }
}

function toVariableOptions(groups: TWorkflowVarGroup[]) {
  const expanded = expandVariablesWithItems(groups)
  const seen = new Set<string>()
  const options: TSelectOption<string>[] = []

  for (const group of expanded ?? []) {
    const groupName = group.group?.name
    const groupLabel = group.group?.description

    for (const variable of group.variables ?? []) {
      if (!variable?.name) {
        continue
      }

      const value = groupName ? `${groupName}.${variable.name}` : variable.name
      if (!value || seen.has(value)) {
        continue
      }
      seen.add(value)

      options.push({
        key: `var:${value}`,
        value,
        label: `{{${value}}}`,
        description: variable.description || groupLabel || ''
      })
    }
  }

  return options
}
