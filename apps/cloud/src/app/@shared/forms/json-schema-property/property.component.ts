import { CommonModule } from '@angular/common'
import { booleanAttribute, Component, computed, effect, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgmSlideToggleComponent } from '@metad/ocap-angular/common'
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
import { TWorkflowVarGroup } from '@cloud/app/@core'

/**
 *
 */
@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    NgmSlideToggleComponent,
    NgmI18nPipe,
    NgmSelectComponent,
    XpertVariableInputComponent
  ],
  selector: 'json-schema-property',
  templateUrl: 'property.component.html',
  styleUrls: ['property.component.scss'],
  hostDirectives: [NgxControlValueAccessor]
})
export class JSONSchemaPropertyComponent {
  protected cva = inject<NgxControlValueAccessor<any>>(NgxControlValueAccessor)
  readonly i18n = new NgmI18nPipe()

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
  readonly enumOptions = computed(() => this.enum()?.map((value) => ({ label: value, value })))

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

  constructor() {
    effect(
      () => {
        if (this.value$() === null && this.default()) {
          this.value$.set(this.default())
        }
      },
      { allowSignalWrites: true }
    )
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
