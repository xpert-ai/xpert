/**
 * Invariants:
 * - Shared schema property rendering stays endpoint-agnostic.
 * - `depends` reads values from `context.model` or explicit context sources and emits flat key/value params for remote selects.
 * - Do not add integration-specific widgets or query-shape exceptions in this layer.
 */
import {
  booleanAttribute,
  Component,
  OnInit,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChildren
} from '@angular/core'
import { FormsModule } from '@angular/forms'
import { XpI18nPipe } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import {
  JsonSchema7ArrayType,
  JsonSchema7EnumType,
  JsonSchema7NumberType,
  JsonSchema7ObjectType,
  JsonSchema7StringType,
  JsonSchema7Type,
  JsonSchema7TypeUnion
} from 'zod-to-json-schema'
import { XpertVariableInputComponent } from '../../agent'
import { XpertRemoteSelectComponent } from '../../form-fields'
import { TWorkflowVarGroup, JsonSchemaUIExtensions } from '../../../@core'
import { JsonSchemaWidgetOutletComponent } from './json-schema-widget-outlet.component'
import { JsonSchemaWidgetStrategyRegistry } from './json-schema-widget-registry.service'
import {
  ZardButtonComponent,
  ZardIconComponent,
  ZardSelectComponent,
  ZardSelectItemComponent,
  ZardAlertComponent,
  ZardCheckboxComponent,
  ZardInputDirective,
  ZardSliderComponent,
  ZardSwitchComponent,
  ZardTooltipImports
} from '@xpert-ai/headless-ui'
import { CommonModule } from '@angular/common'
import { JsonSchemaFormOptions } from '../json-schema-form/form-options'
import { buildJsonSchemaDefaults } from '../../workflow/trigger-config/trigger-config.util'
import { jsonObject } from '../json-schema-form/schema'

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
    XpI18nPipe,
    XpertVariableInputComponent,
    XpertRemoteSelectComponent,
    JsonSchemaWidgetOutletComponent,
    ZardInputDirective,
    ZardSliderComponent,
    ZardSwitchComponent,
    ZardCheckboxComponent,
    ZardButtonComponent,
    ZardIconComponent,
    ZardSelectComponent,
    ZardSelectItemComponent,
    ZardAlertComponent
  ],
  selector: 'json-schema-property',
  templateUrl: 'property.component.html',
  styleUrls: ['property.component.scss'],
  hostDirectives: [NgxControlValueAccessor],
  host: {
    '[class]': `xUiSpan() ? 'col-span-' + xUiSpan() : ''`,
    '[class.hidden]': '!visible()'
  }
})
export class JSONSchemaPropertyComponent implements OnInit {
  protected cva = inject<NgxControlValueAccessor<any>>(NgxControlValueAccessor)
  readonly i18n = new XpI18nPipe()
  readonly widgetRegistry? = inject(JsonSchemaWidgetStrategyRegistry, { optional: true })
  readonly formOptions? = inject(JsonSchemaFormOptions, { optional: true })

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
  readonly children = viewChildren(JSONSchemaPropertyComponent)
  readonly variants = computed(() => {
    const schema = this.schema()
    const variants = schema && 'anyOf' in schema && Array.isArray(schema.anyOf) ? schema.anyOf : []
    return variants.length &&
      variants.every(
        (item) =>
          item &&
          'type' in item &&
          item.type === 'object' &&
          'properties' in item &&
          item.properties &&
          typeof item.properties === 'object' &&
          Object.values(item.properties).some(
            (property) => property && typeof property === 'object' && 'const' in property
          )
      )
      ? (variants as JsonSchema7ObjectType[])
      : []
  })
  readonly variantIndex = computed(() => {
    const value: unknown = this.value$()
    if (!jsonObject(value)) return 0
    const index = this.variants().findIndex(
      (variant) =>
        'properties' in variant &&
        Object.entries(variant.properties).some(
          ([key, property]) => 'const' in property && Object.is(property.const, value[key])
        )
    )
    return Math.max(0, index)
  })
  readonly node = computed(() => this.variants()[this.variantIndex()] ?? this.schema())
  variantLabel(variant: JsonSchema7Type, index: number) {
    if (variant.title) return variant.title
    if ('properties' in variant) {
      for (const property of Object.values(variant.properties)) {
        if ('const' in property) return String(property.const)
      }
    }
    return String(index + 1)
  }
  selectVariant(index: number) {
    const variant = this.variants()[index]
    if (!variant || !('properties' in variant)) return
    const value = buildJsonSchemaDefaults(variant) ?? {}
    for (const [key, property] of Object.entries(variant.properties)) {
      if ('const' in property) value[key] = property.const
    }
    this.value$.set(value)
  }
  readonly type = computed<string | undefined>(() => {
    const schema = this.node()
    return schema && 'type' in schema && typeof schema.type === 'string' ? schema.type : undefined
  })

  readonly value$ = this.cva.value$

  readonly meta = computed(() => ({ ...this.schema(), ...this.node() }) as JsonSchema7Type)
  // x-ui
  readonly xUi = computed<JsonSchemaUIExtensions>(() => (this.meta() as JsonSchemaTypeWithUi)?.['x-ui'] || {})
  readonly xUiTitle = computed(() => this.xUi().title)
  readonly xUiDescription = computed(() => this.xUi().description)
  readonly label = computed(() => this.xUiTitle() || this.meta()?.title || this.meta()?.description || this.name())
  readonly propertyDescription = computed(() => this.xUiDescription() || this.meta()?.description)
  readonly placeholderMeta = computed(() => this.propertyDescription() || this.xUiTitle() || this.meta()?.title || '')
  readonly stringSchema = computed(() => this.node() as JsonSchema7StringType)
  readonly numberSchema = computed(() => this.node() as JsonSchema7NumberType)
  readonly arraySchema = computed(() => this.node() as JsonSchema7ArrayType)
  readonly objectSchema = computed(() => this.node() as JsonSchema7ObjectType)
  readonly enumSchema = computed(() => this.node() as JsonSchema7EnumType)
  readonly objectCollapsed = signal(true)

  readonly enum = computed(
    () => this.enumSchema()?.enum ?? (this.node() && 'const' in this.node() ? [this.node()['const']] : undefined)
  )
  readonly enumOptions = computed(() => {
    const enumLabels = this.xUi()?.enumLabels
    const items =
      this.enum()?.map((value) => ({
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

  readonly default = computed(
    () =>
      (this.schema() as JsonSchema7Type)?.default ??
      this.meta()?.default ??
      ('const' in (this.node() ?? {}) ? this.node()['const'] : undefined)
  )
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

  readonly jsonText = linkedSignal(() => JSON.stringify(this.value$(), null, 2) ?? '')
  readonly jsonError = linkedSignal(() => {
    this.schema()
    this.value$()
    return false
  })
  readonly jsonEditor = computed(
    () =>
      this.xUiComponent() === 'json' ||
      (!this.hasCustomWidget() &&
        ((this.type() === 'object' && !this.properties()?.length) ||
          (this.schema() && 'anyOf' in this.schema() && !this.variants().length) ||
          Array.isArray(this.schema()?.['type'])))
  )
  readonly enumSelection = computed(() => {
    const options = this.enumOptions()
    const value = this.value$()
    return this.type() === 'array'
      ? Array.isArray(value)
        ? value.map((item) => options.findIndex((option) => Object.is(option.value, item)))
        : []
      : options.some((option) => Object.is(option.value, value))
        ? options.findIndex((option) => Object.is(option.value, value))
        : ''
  })
  updateEnum(selection: number | number[] | string) {
    this.value$.set(
      Array.isArray(selection)
        ? selection.map((index) => this.enumOptions()[index]?.value)
        : selection === ''
          ? undefined
          : this.enumOptions()[Number(selection)]?.value
    )
  }
  updateJson(text: string) {
    this.jsonText.set(text)
    try {
      const value: unknown = text.trim() ? JSON.parse(text) : undefined
      this.jsonError.set(false)
      this.value$.set(value)
    } catch {
      this.jsonError.set(true)
    }
  }
  readonly #invalid = computed(() => {
    if (!this.visible()) return false
    const value = this.value$()
    return (
      this.jsonError() ||
      (this.required() && (value == null || value === '')) ||
      (value != null && this.children().some((child) => child.invalid))
    )
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
  readonly controlName = computed(() => this.xUiComponent() || (this.type() === 'boolean' ? 'switch' : this.type()))
  readonly controlInputs = computed(() => {
    const defaults = this.formOptions?.controlDefaults() ?? {}
    const type = this.type()
    const controlName = this.controlName()
    const typeDefaults = type ? defaults[type] : undefined
    const controlDefaults = controlName ? defaults[controlName] : undefined

    return {
      ...(typeDefaults ?? {}),
      ...(controlDefaults ?? {}),
      ...(this.xUi()?.inputs ?? {})
    }
  })
  readonly visible = computed(() => {
    const visibleWhen = this.xUi()?.visibleWhen
    if (!visibleWhen) {
      return true
    }

    const conditions = Array.isArray(visibleWhen) ? visibleWhen : [visibleWhen]
    return conditions.every((condition) => evaluateVisibilityCondition(condition, this.context()))
  })
  readonly textareaRows = computed(() => {
    const rows = this.xUi()?.inputs?.['rows']
    return typeof rows === 'number' && Number.isFinite(rows) && rows > 0 ? rows : 1
  })
  readonly hasCustomWidget = computed(() => this.widgetRegistry?.has(this.xUiComponent()))
  readonly collapsibleObject = computed(
    () =>
      this.type() === 'object' &&
      !this.hasCustomWidget() &&
      !this.variants().length &&
      Boolean(this.properties()?.length)
  )

  /** Resolves any renderer input from form defaults, then field-level `x-ui.inputs`. */
  controlInput<T>(name: string, fallback: T): T {
    return (this.controlInputs()[name] ?? fallback) as T
  }

  readonly depends = computed(() => {
    const context = this.context()
    const model = context?.model
    return (this.xUi()?.depends ?? []).reduce((acc: { [key: string]: unknown }, _) => {
      if (typeof _ === 'string') {
        const value = model?.[_] ?? this.value$()?.[_]
        if (value != null) {
          acc[_] = value
        }
      } else if (typeof _ === 'object' && 'name' in _) {
        const value = _.source === 'context' ? context?.[_.name] : (model?.[_.name] ?? this.value$()?.[_.name])
        if (value != null) {
          acc[_.alias || _.name] = value
        }
      }
      return acc
    }, {})
  })

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
      const next = [...(state ?? [])]
      next[index] = value
      return next
    })
  }

  addArray() {
    this.value$.update((state) => [...(state ?? []), null])
  }

  removeArray(index: number) {
    this.value$.update((state) => (state ?? []).filter((_, position) => position !== index))
  }

  isRequired(name: string) {
    return this.objectSchema().required?.includes(name)
  }

  updateValue(name: string, value: unknown) {
    this.value$.update((state) => {
      const next = { ...(state ?? {}), [name]: value }
      if (value === undefined) delete next[name]
      return next
    })
  }
}

type JsonSchemaUIVisibilityCondition =
  NonNullable<JsonSchemaUIExtensions['visibleWhen']> extends infer Condition
    ? Condition extends readonly (infer Item)[]
      ? Item
      : Condition
    : never

function evaluateVisibilityCondition(condition: JsonSchemaUIVisibilityCondition, context?: JsonSchemaPropertyContext) {
  const value = condition.source === 'context' ? context?.[condition.name] : context?.model?.[condition.name]
  const exists = value != null
  let matched = true

  if (condition.exists != null) {
    matched = exists === condition.exists
  } else if ('value' in condition) {
    matched = Object.is(value, condition.value)
  } else if (condition.values) {
    matched = condition.values.some((item) => Object.is(item, value))
  } else {
    matched = exists
  }

  return condition.not ? !matched : matched
}
