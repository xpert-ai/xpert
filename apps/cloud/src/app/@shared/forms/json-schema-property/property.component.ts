/**
 * Invariants:
 * - Shared schema property rendering stays endpoint-agnostic.
 * - `depends` reads sibling values from `context.model` and emits flat key/value params for remote selects.
 * - Do not add integration-specific widgets or query-shape exceptions in this layer.
 */
import { booleanAttribute, Component, OnInit, computed, inject, input, output, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgmI18nPipe } from '@xpert-ai/ocap-angular/core'
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
import { XpertRemoteSelectComponent } from '../../form-fields'
import { TWorkflowVarGroup, JsonSchemaUIExtensions } from '../../../@core'
import { JsonSchemaWidgetOutletComponent } from './json-schema-widget-outlet.component'
import { JsonSchemaWidgetStrategyRegistry } from './json-schema-widget-registry.service'
import { ZardInputDirective, ZardSwitchComponent, ZardTooltipImports } from '@xpert-ai/headless-ui'
import { CommonModule } from '@angular/common'

type JsonSchemaTypeWithUi = JsonSchema7Type & {
  'x-ui'?: JsonSchemaUIExtensions
}

type JsonSchemaPropertyContext = {
  [key: string]: unknown
  model?: { [key: string]: unknown }
}

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    ...ZardTooltipImports,
    NgmI18nPipe,
    NgmSelectComponent,
    XpertVariableInputComponent,
    XpertRemoteSelectComponent,
    JsonSchemaWidgetOutletComponent,
    ZardInputDirective,
    ZardSwitchComponent
  ],
  selector: 'json-schema-property',
  templateUrl: 'property.component.html',
  styleUrls: ['property.component.scss'],
  hostDirectives: [NgxControlValueAccessor],
  host: {
    '[class]': `xUiSpan() ? 'col-span-' + xUiSpan() : ''`
  }
})
export class JSONSchemaPropertyComponent implements OnInit {
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
  readonly context = input<JsonSchemaPropertyContext | undefined>(undefined)
  readonly arrayItem = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })
  readonly arrayIndex = input<number>()
  readonly removeItem = output<void>()

  // Attrs
  get invalid() {
    return this.#invalid()
  }

  // States
  readonly type = computed<string | undefined>(() => {
    const schema = this.schema()
    return schema && 'type' in schema && typeof schema.type === 'string' ? schema.type : undefined
  })

  readonly value$ = this.cva.value$

  readonly meta = computed(() => this.schema() as JsonSchema7Type)
  // x-ui
  readonly xUi = computed<JsonSchemaUIExtensions>(() => (this.meta() as JsonSchemaTypeWithUi)?.['x-ui'] || {})
  readonly xUiTitle = computed(() => this.xUi().title)
  readonly xUiDescription = computed(() => this.xUi().description)
  readonly label = computed(() => this.xUiTitle() || this.meta()?.title || this.meta()?.description || this.name())
  readonly propertyDescription = computed(() => this.xUiDescription() || this.meta()?.description)
  readonly placeholderMeta = computed(() => this.propertyDescription() || this.xUiTitle() || this.meta()?.title || '')
  readonly stringSchema = computed(() => this.schema() as JsonSchema7StringType)
  readonly arraySchema = computed(() => this.schema() as JsonSchema7ArrayType)
  readonly objectSchema = computed(() => this.schema() as JsonSchema7ObjectType)
  readonly enumSchema = computed(() => this.schema() as JsonSchema7EnumType)
  readonly objectCollapsed = signal(true)

  readonly enum = computed(() => this.enumSchema()?.enum)
  readonly enumOptions = computed(() => {
    const enumLabels = this.xUi()?.enumLabels
    const items = this.enum()?.map((value) => ({
      label: this.i18n.transform(enumLabels?.[`${value}`] ?? `${value}`),
      value
    })) ?? []
    const values = Array.isArray(this.value$()) ? this.value$() : this.value$() != null ? [this.value$()] : []
    values.forEach((element) => {
      if (!items.some((_) => _.value === element)) {
        items.push({ label: this.i18n.transform(`${element}`), value: element })
      }
    })
    return items
  })

  readonly default = computed(() => this.meta()?.default)
  readonly arrayItemPosition = computed(() => (this.arrayIndex() ?? 0) + 1)
  readonly arrayItemTitleParams = computed(() => ({
    Default: `Item ${this.arrayItemPosition()}`,
    index: this.arrayItemPosition()
  }))

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

  readonly xUiComponent = computed(() => this.xUi()?.component)
  readonly xUiInputType = computed(() =>
    ['secretInput', 'password'].includes(this.xUi()?.component) ? 'password' : 'text'
  )
  readonly xUiRevealable = computed(() => this.xUi()?.revealable)
  readonly xUiHelp = computed(() => this.xUi()?.help)
  readonly xUiSpan = computed(() => this.xUi()?.span)
  readonly xUiCols = computed(() => this.xUi()?.cols)
  readonly xUiStyles = computed(() => this.xUi()?.styles)
  readonly textareaRows = computed(() => {
    const rows = this.xUi()?.inputs?.['rows']
    return typeof rows === 'number' && Number.isFinite(rows) && rows > 0 ? rows : 1
  })
  readonly hasCustomWidget = computed(() => this.widgetRegistry?.has(this.xUiComponent()))
  readonly collapsibleObject = computed(
    () => this.type() === 'object' && !this.hasCustomWidget() && Boolean(this.properties()?.length)
  )
  readonly depends = computed(() =>
    (this.xUi()?.depends ?? []).reduce((acc: { [key: string]: unknown }, _) => {
      const model = this.context()?.model
      if (typeof _ === 'string') {
        const value = model?.[_] ?? this.value$()?.[_]
        if (value != null) {
          acc[_] = value
        }
      } else if (typeof _ === 'object' && 'name' in _) {
        const value = model?.[_.name] ?? this.value$()?.[_.name]
        if (value != null) {
          acc[_.alias || _.name] = value
        }
      }
      return acc
    }, {})
  )

  constructor() {
    // Waiting NgxControlValueAccessor has been initialized
    setTimeout(() => {
      if (this.value$() == null && this.default() != null) {
        // Wait until sibling controls are initialized so each field can apply its own schema default.
        setTimeout(() => {
          this.value$.set(this.default())
        })
      }
    })
  }

  ngOnInit() {
    if (this.arrayItem()) {
      this.objectCollapsed.set(false)
    }
  }

  update(value: unknown) {
    this.value$.set(value)
  }

  updateNumber(value: unknown) {
    this.value$.set(value === '' ? null : Number.parseFloat(`${value}`))
  }

  toggleObjectCollapsed() {
    this.objectCollapsed.update((state) => !state)
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
