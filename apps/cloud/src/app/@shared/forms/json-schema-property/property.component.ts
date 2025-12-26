import { CommonModule } from '@angular/common'
import { booleanAttribute, Component, computed, effect, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { NgmRemoteSelectComponent, NgmSlideToggleComponent } from '@metad/ocap-angular/common'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import {
  JsonSchema7ArrayType,
  JsonSchema7EnumType,
  JsonSchema7ObjectType,
  JsonSchema7StringType,
  JsonSchema7Type,
  JsonSchema7TypeUnion
} from 'zod-to-json-schema'
import { XpertVariableInputComponent } from '../../agent'
import { NgmSelectComponent } from '../../common'
import { TWorkflowVarGroup } from '../../../@core'
import {
  JsonSchemaWidgetOutletComponent
} from './json-schema-widget-outlet.component'
import { JsonSchemaWidgetStrategyRegistry } from './json-schema-widget-registry.service'

/**
 *
 */
@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    MatTooltipModule,
    NgmSlideToggleComponent,
    NgmI18nPipe,
    NgmSelectComponent,
    XpertVariableInputComponent,
    NgmRemoteSelectComponent,
    JsonSchemaWidgetOutletComponent
  ],
  selector: 'json-schema-property',
  templateUrl: 'property.component.html',
  styleUrls: ['property.component.scss'],
  hostDirectives: [NgxControlValueAccessor],
  host: {
    '[class]': `xUiSpan() ? 'col-span-' + xUiSpan() : ''`,
  }
})
export class JSONSchemaPropertyComponent {
  protected cva = inject<NgxControlValueAccessor<any>>(NgxControlValueAccessor)
  readonly i18n = new NgmI18nPipe()
  readonly widgetRegistry? = inject(JsonSchemaWidgetStrategyRegistry, { optional: true })

  // Inputs
  readonly name = input<string>()
  readonly schema = input<JsonSchema7TypeUnion>()
  readonly variables = input<TWorkflowVarGroup[]>()
  readonly readonly = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })
  readonly required = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })
  readonly context = input<Record<string, unknown> | undefined>(undefined)

  // Attrs
  get invalid() {
    return this.#invalid()
  }

  // States
  readonly type = computed(() => (<any>this.schema())?.type)

  readonly value$ = this.cva.value$

  readonly meta = computed(() => this.schema() as JsonSchema7Type)
  readonly stringSchema = computed(() => this.schema() as JsonSchema7StringType)
  readonly arraySchema = computed(() => this.schema() as JsonSchema7ArrayType)
  readonly objectSchema = computed(() => this.schema() as JsonSchema7ObjectType)
  readonly enumSchema = computed(() => this.schema() as JsonSchema7EnumType)

  readonly enum = computed(() => this.enumSchema()?.enum)
  readonly enumOptions = computed(() => {
    const items = this.enum()?.map((value) => ({ label: this.xUi()?.enumLabels?.[value] ?? value, value })) ?? []
    const values = Array.isArray(this.value$()) ? this.value$() : this.value$() != null ? [this.value$()] : []
    values.forEach((element) => {
      if (!items.some((_) => _.value === element)) {
        items.push({ label: element as string, value: element })
      }
    })
    return items
  })

  readonly default = computed(() => this.meta()?.default)

  readonly properties = computed(
    () =>
      this.objectSchema()?.properties &&
      Object.entries(this.objectSchema().properties).map(([name, value]) => ({
        ...value,
        name
      }))
  )

  readonly #invalid = computed(() => {
    return false
  })

  // x-ui
  readonly xUi = computed(() => (this.meta() as any)?.['x-ui'] || {})
  readonly xUiComponent = computed(() => this.xUi()?.component)
  readonly xUiInputType = computed(() => this.xUi()?.component === 'secretInput' ? 'password' : 'text')
  readonly xUiRevealable = computed(() => this.xUi()?.revealable)
  readonly xUiHelp = computed(() => this.xUi()?.help)
  readonly xUiSpan = computed(() => this.xUi()?.span)
  readonly xUiStyles = computed(() => this.xUi()?.styles)
  readonly hasCustomWidget = computed(() => this.widgetRegistry?.has(this.xUiComponent()))

  constructor() {
    // Waiting NgxControlValueAccessor has been initialized
    setTimeout(() => {
      if (this.value$() === null && this.default() != null) {
        // Waiting all controls have been initialized then update the default value, because other's value$() will be undefined (not null) when updated
        setTimeout(() => {
          this.value$.set(this.default())
        })
      }
    })
  }

  update(value: unknown) {
    this.value$.set(value)
  }

  updateArray(index: number, value: unknown) {
    this.value$.update((state) => {
      state ??= []
      state[index] = value
      return [...state]
    })
  }

  addArray() {
    this.value$.update((state) => {
      state ??= []
      state.push(null)
      return [...state]
    })
  }

  removeArray(index: number) {
    this.value$.update((state) => {
      state ??= []
      state.splice(index, 1)
      return [...state]
    })
  }

  isRequired(name: string) {
    return this.objectSchema().required?.includes(name)
  }

  updateValue(name: string, value: unknown) {
    this.value$.update((state) => ({ ...(state ?? {}), [name]: value }))
  }
}
