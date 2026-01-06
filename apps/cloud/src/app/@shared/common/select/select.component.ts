import { CdkListboxModule, ListboxValueChangeEvent } from '@angular/cdk/listbox'
import { CdkMenuModule, CdkMenuTrigger } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { booleanAttribute, Component, computed, contentChild, inject, input, model, TemplateRef, ViewChild, effect } from '@angular/core'
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
  readonly selectOptions = input<TSelectOption<any>[]>([])
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
    // Return empty array if no options to prevent CdkListbox errors
    if (!options || options.length === 0) {
      return []
    }
    // Ensure all options have a valid key and value property to prevent CdkListbox errors
    const validOptions = options
      .map((option, index) => {
        const value = option.value ?? option.key ?? `option-${index}`
        const key = option.key ?? String(value)
        return {
          ...option,
          key: key,
          value: value
        }
      })
      .filter(opt => opt.value != null && opt.value !== '' && opt.key != null && opt.key !== '')
    
    if (validOptions.length === 0) {
      return []
    }
    
    const searchTerm = this.searchTerm()?.toLowerCase()
    if (!searchTerm) {
      return validOptions
    }

    return validOptions.filter((option) => {
      const label = this.i18n.transform(option.label)
      const description = this.i18n.transform(option.description)
      const valueStr = String(option.value ?? '')
      return label?.toLowerCase().includes(searchTerm) 
        || description?.toLowerCase().includes(searchTerm) 
        || valueStr?.toLowerCase().includes(searchTerm)
        || this.values().includes(option.value)
    })
  })

  readonly selectedOptions = computed(() =>
    this.values()?.map((value) => this.selectOptions()?.find((_) => _.value === value) ?? { value })
  )

  readonly values = computed(() => {
    const currentValue = this.multiple() ? this.cva.value$() : (this.cva.value$() ? [this.cva.value$()] : [])
    const filteredOptions = this.filteredOptions()
    
    // Filter values to only include those that exist in the filtered options list
    // This prevents "Listbox has selected values that do not match any of its options" error
    if (!currentValue || currentValue.length === 0 || filteredOptions.length === 0) {
      return []
    }
    
    // Only return values that exist in filteredOptions
    // This ensures CdkListbox never receives invalid values
    const filteredOptionValues = new Set(filteredOptions.map(opt => opt.value))
    const validValues = currentValue.filter(val => filteredOptionValues.has(val))
    
    return validValues
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
      // Reset search before closing to prevent state issues
      this.search.set('')
      trigger.close()
    }
  }

  clear() {
    this.cva.writeValue(this.multiple() ? [] : null)
  }
}
