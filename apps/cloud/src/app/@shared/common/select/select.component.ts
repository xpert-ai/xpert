import { CdkListboxModule, ListboxValueChangeEvent } from '@angular/cdk/listbox'
import { CdkMenuModule, CdkMenuTrigger } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { booleanAttribute, Component, computed, contentChild, inject, input, model, TemplateRef } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { NgmHighlightDirective } from '@metad/ocap-angular/common'
import { debouncedSignal, NgmDensityDirective, NgmI18nPipe, TSelectOption } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'

/**
 *
 */
@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    CdkListboxModule,
    CdkMenuModule,
    NgmHighlightDirective,
    NgmI18nPipe
  ],
  selector: 'ngm-select',
  templateUrl: 'select.component.html',
  styleUrls: ['select.component.scss'],
  hostDirectives: [NgxControlValueAccessor, NgmDensityDirective],
  inputs: ['small', 'large'],
  host: {
    '[class.inline]': 'inline()'
  }
})
export class NgmSelectComponent {
  protected cva = inject<NgxControlValueAccessor<any>>(NgxControlValueAccessor)
  readonly i18n = new NgmI18nPipe()

  // Inputs
  readonly placeholder = input<string>()
  readonly selectOptions = input<TSelectOption<any>[]>()
  readonly multiple = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  readonly inline = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  readonly nullable = input<boolean, boolean | string>(true, {
    transform: booleanAttribute
  })

  readonly icon = input<string>()

  readonly readonly = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  readonly searchable = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  // Children
  readonly optionTemplate = contentChild('option', { read: TemplateRef })

  // States
  readonly search = model<string>()
  readonly searchTerm = debouncedSignal(this.search, 300)
  readonly filteredOptions = computed(() => {
    const options = this.selectOptions() ?? []
    const searchTerm = this.searchTerm()?.toLowerCase()
    if (!searchTerm) {
      return options
    }

    return options.filter((option) => {
      const label = this.i18n.transform(option.label)
      const description = this.i18n.transform(option.description)
      return label?.toLowerCase().includes(searchTerm) || description?.toLowerCase().includes(searchTerm) || option.value?.toLowerCase().includes(searchTerm)
        || this.values().includes(option.value)
    })
  })

  readonly selectedOptions = computed(() =>
    this.values()?.map((value) => this.selectOptions()?.find((_) => _.value === value) ?? { value })
  )

  readonly values = computed(() => {
    if (this.multiple()) {
      return this.cva.value$()
    } else {
      return this.cva.value$() ? [this.cva.value$()] : []
    }
  })

  readonly _disabled = this.cva.disabled$

  selectValues(event: ListboxValueChangeEvent<unknown>) {
    if (this.multiple()) {
      this.cva.value$.set([...event.value])
    } else {
      this.cva.value$.set(event.value[0] ?? null)
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
