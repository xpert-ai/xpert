import { CommonModule } from '@angular/common'
import { booleanAttribute, Component, computed, effect, inject, input } from '@angular/core'
import { FormGroup, FormsModule } from '@angular/forms'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { isNil } from 'lodash-es'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { JsonSchemaObjectType, TWorkflowVarGroup } from '@cloud/app/@core'
import { JSONSchemaPropertyComponent } from '../json-schema-property/property.component'

/**
 * 
 */
@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, JSONSchemaPropertyComponent],
  selector: 'json-schema-form',
  templateUrl: 'form.component.html',
  styleUrls: ['form.component.scss'],
  hostDirectives: [NgxControlValueAccessor]
})
export class JSONSchemaFormComponent {

  protected cva = inject<NgxControlValueAccessor<Record<string, unknown>>>(NgxControlValueAccessor)
  readonly i18n = new NgmI18nPipe()

  // Inputs
  readonly schema = input<JsonSchemaObjectType>()
  readonly variables = input<TWorkflowVarGroup[]>()
  readonly readonly = input<boolean, string | boolean>(false, {
      transform: booleanAttribute
    })
  readonly context = input<Record<string, unknown> | undefined>(undefined)

  // Attrs
  get invalid() {
    return this.#invalid()
  }

  // States
  readonly properties = computed(() => this.schema()?.properties && Object.entries(this.schema().properties).map(([name, value]) => ({
    ...value,
    name,
  })) )

  readonly value$ = this.cva.value$

  readonly form = new FormGroup({})
  // optionsModel = {}
  formOptions = {}

  readonly #invalid = computed(() => {
    if (this.schema().required?.length) {
      return this.schema().required.some((name) => isNil(this.value$()?.[name]))
    }
    return false
  })


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
