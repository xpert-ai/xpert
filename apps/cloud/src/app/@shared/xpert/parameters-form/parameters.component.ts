import { CommonModule } from '@angular/common'
import { booleanAttribute, Component, computed, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { SlashSvgComponent, VariableSvgComponent } from '@metad/ocap-angular/common'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { DisplayBehaviour } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { isNil } from 'lodash-es'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { TSelectOption, TXpertParameter, XpertParameterTypeEnum } from '../../../@core'
import { NgmSelectComponent } from '../../common'

@Component({
  standalone: true,
  selector: 'xpert-parameters-form',
  templateUrl: './parameters.component.html',
  styleUrl: 'parameters.component.scss',
  imports: [
    CommonModule,
    FormsModule,
    MatTooltipModule,
    TranslateModule,
    NgmI18nPipe,
    NgmSelectComponent,
    VariableSvgComponent,
    SlashSvgComponent,
  ],
  hostDirectives: [NgxControlValueAccessor]
})
export class XpertParametersFormComponent {
  eXpertParameterTypeEnum = XpertParameterTypeEnum
  eDisplayBehaviour = DisplayBehaviour

  protected cva = inject<NgxControlValueAccessor<Partial<Record<string, unknown>> | null>>(NgxControlValueAccessor)

  // Inputs
  readonly parameters = input<TXpertParameter[]>()
  readonly readonly = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  // States
  readonly params = computed<Array<TXpertParameter & {selectOptions?: TSelectOption[]}>>(() => {
    return this.parameters().map((parameter) => {
      if (parameter.type === XpertParameterTypeEnum.SELECT) {
        return {
          ...parameter,
          // Handle null/undefined options to prevent "Cannot read properties of null (reading 'map')" error
          // when user creates SELECT parameter with only name but no options
          selectOptions: (parameter.options ?? []).map((key) => ({
            value: key,
            label: key
          }))
        } as TXpertParameter
      }

      return parameter
    })
  })

  constructor() {
    // If the initial value is null, but there are parameters with default values, set the value to those defaults
    setTimeout(() => {
      if (this.cva.value == null && this.parameters()?.some((param) => !isNil(param.default))) {
        this.cva.writeValue(
          this.parameters().reduce((acc, cur) => ({ ...acc, [cur.name]: cur.default ?? null }), {})
        )
      }
    })
  }


  /**
   * Get parameter value for input fields.
   * Returns empty string for object values to prevent "[object Object]" display.
   */
  getParameter(name: string) {
    const value = this.cva.value?.[name]
    // If value is an object (not null, not array, not primitive), return empty string
    if (value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value)) {
      return ''
    }
    return value ?? ''
  }

  /**
   * Update parameter value for input fields.
   */
  updateParameter(name: string, value: unknown) {
    this.cva.writeValue({
      ...(this.cva.value ?? {}),
      [name]: value
    })
  }

  // Cache for nested value references to ensure stability and prevent infinite loops
  private nestedValueCache = new Map<string, Record<string, unknown>>()

  /**
   * Get nested object value for hierarchical parameters with stable reference.
   * Uses caching to prevent infinite loops caused by new object references on each render.
   * Avoids writing to signals during template evaluation to prevent NG0600 errors.
   */
  getNestedValue(name: string): Record<string, unknown> {
    const currentValue = this.cva.value?.[name]
    
    // If current value exists and is a valid object, use it
    if (currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue)) {
      const cached = this.nestedValueCache.get(name)
      // If cached reference matches current value, return cached to maintain stability
      if (cached === currentValue) {
        return cached
      }
      // Update cache with current value reference for future use
      this.nestedValueCache.set(name, currentValue as Record<string, unknown>)
      return currentValue as Record<string, unknown>
    }
    
    // Check if we have a cached value (even if not in currentValue)
    const cached = this.nestedValueCache.get(name)
    if (cached) {
      return cached
    }
    
    // Create new nested object only once and cache it
    // Don't initialize in parent value here to avoid write during template evaluation
    // It will be initialized when child component writes a value
    const nestedObj: Record<string, unknown> = {}
    this.nestedValueCache.set(name, nestedObj)
    return nestedObj
  }

  /**
   * Update nested object value from child form.
   */
  updateNestedValue(name: string, value: Record<string, unknown>) {
    const currentValue = this.cva.value ?? {}
    // Only update if value actually changed to prevent unnecessary updates
    const existingValue = currentValue[name]
    if (existingValue !== value) {
      this.cva.writeValue({
        ...currentValue,
        [name]: value
      })
      // Update cache to maintain reference stability
      this.nestedValueCache.set(name, value)
    }
  }
}
