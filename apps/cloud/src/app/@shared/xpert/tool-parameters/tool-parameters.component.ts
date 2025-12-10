import { CommonModule } from '@angular/common'
import { booleanAttribute, Component, computed, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { IXpertTool, JsonSchemaObjectType, TToolParameter, TWorkflowVarGroup } from '@cloud/app/@core'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { isNil } from 'lodash-es'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { XpertVariableInputComponent } from '../../agent'
import { JSONSchemaFormComponent } from '../../forms'

/**
 * Compatible with two schema modes:
 * 1. Built-in yaml schema
 * 2. JSON schema
 */
@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    NgmI18nPipe,
    JSONSchemaFormComponent,
    XpertVariableInputComponent
  ],
  selector: 'xp-tool-parameters-form',
  templateUrl: 'tool-parameters.component.html',
  styleUrls: ['tool-parameters.component.scss'],
  hostDirectives: [NgxControlValueAccessor]
})
export class XpToolParametersFormComponent {
  protected cva = inject<NgxControlValueAccessor<Record<string, unknown>>>(NgxControlValueAccessor)
  readonly i18n = new NgmI18nPipe()

  // Inputs
  readonly tool = input<IXpertTool>()
  readonly variables = input<TWorkflowVarGroup[]>()
  readonly readonly = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })

  // Attrs
  get invalid() {
    return this.#invalid()
  }

  // States
  readonly parameters = this.cva.value$
  readonly schema = computed(() => this.tool()?.schema)
  readonly parameterList = computed<TToolParameter[]>(() => {
    const parameters = this.schema()?.parameters ?? this.tool()?.provider?.parameters
    return parameters?.filter((_) => isNil(_.visible) || _.visible)
  })
  readonly jsonSchema = computed(() => this.tool()?.schema as JsonSchemaObjectType)

  readonly #invalid = computed(() => {
    const required = this.parameterList()?.filter((p) => p.required)
    if (required?.length) {
      return required.some(({ name }) => isNil(this.parameters()?.[name]))
    }
    return false
  })

  onParameter(name: string, event: any) {
    this.parameters.update((state) => ({
      ...(state ?? {}),
      [name]: event
    }))
  }
}
