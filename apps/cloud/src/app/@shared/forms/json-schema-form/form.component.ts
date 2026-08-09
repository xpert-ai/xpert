/**
 * Invariants:
 * - Child properties need `context.model` to resolve sibling-driven `x-ui.depends`.
 * - The injected model must be the current object value being edited, not a stale parent snapshot.
 * - Keep this layer schema-driven; endpoint-specific select behavior belongs in property/field components.
 */
import { booleanAttribute, Component, computed, effect, inject, input } from '@angular/core'
import { FormGroup, FormsModule } from '@angular/forms'
import { XpI18nPipe } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { isNil } from 'lodash-es'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { JsonSchemaObjectType, TWorkflowVarGroup } from '@cloud/app/@core'
import { JSONSchemaPropertyComponent } from '../json-schema-property/property.component'
import { type JsonSchemaControlDefaults, JsonSchemaFormOptions } from './form-options'

@Component({
  standalone: true,
  imports: [FormsModule, TranslateModule, JSONSchemaPropertyComponent],
  selector: 'json-schema-form',
  templateUrl: 'form.component.html',
  styleUrls: ['form.component.scss'],
  providers: [JsonSchemaFormOptions],
  hostDirectives: [NgxControlValueAccessor],
  host: {
    '[class]': `xUiSpan() ? 'gap-2 grid grid-cols-' + xUiSpan() : ''`
  }
})
export class JSONSchemaFormComponent {
  protected cva = inject<NgxControlValueAccessor<Record<string, unknown>>>(NgxControlValueAccessor)
  private readonly schemaFormOptions = inject(JsonSchemaFormOptions)
  readonly i18n = new XpI18nPipe()

  // Inputs
  readonly schema = input<JsonSchemaObjectType>()
  readonly variables = input<TWorkflowVarGroup[]>()
  readonly readonly = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })
  readonly context = input<Record<string, unknown> | undefined>(undefined)
  /**
   * Form-scoped defaults for rendered control inputs.
   *
   * Example: `{ switch: { zSize: 'sm' } }`. Individual fields can override these
   * values with `x-ui.inputs` without adding another input to this component.
   */
  readonly controlDefaults = input<JsonSchemaControlDefaults>({})

  // Attrs
  get invalid() {
    return this.#invalid()
  }

  // States
  readonly properties = computed(
    () =>
      this.schema()?.properties &&
      Object.entries(this.schema().properties).map(([name, value]) => ({
        ...value,
        name
      }))
  )

  readonly xUi = computed(() => this.schema()?.['x-ui'] || {})
  readonly xUiSpan = computed(() => this.xUi()?.cols)

  readonly value$ = this.cva.value$
  readonly propertyContext = computed(() => ({
    ...(this.context() ?? {}),
    model: this.value$()
  }))

  readonly form = new FormGroup({})
  // optionsModel = {}
  formOptions = {}

  readonly #invalid = computed(() => {
    if (this.schema().required?.length) {
      return this.schema().required.some((name) => isNil(this.value$()?.[name]))
    }
    return false
  })

  constructor() {
    effect(() => this.schemaFormOptions.controlDefaults.set(this.controlDefaults()))
  }

  updateValue(name: string, value: unknown) {
    this.value$.update((state) => ({ ...(state ?? {}), [name]: value }))
  }

  updateValues(value) {
    this.value$.update((state) => ({ ...(state ?? {}), ...value }))
  }

  isRequired(name: string) {
    return this.schema().required?.includes(name)
  }
}
