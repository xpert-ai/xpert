import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core'
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatInputModule } from '@angular/material/input'
import { MatRadioModule } from '@angular/material/radio'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { MatTooltipModule } from '@angular/material/tooltip'
import { isNil } from '@metad/copilot'
import { NgmDensityDirective, NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { AI_MODEL_TYPE_VARIABLE, AiModelTypeEnum, CredentialFormSchema, CredentialFormTypeEnum, ParameterType } from '../../../@core'
import { NgmSelectComponent } from '../../common'

/**
 * @todo Use JSON Schema to implement
 */
@Component({
  standalone: true,
  selector: 'copilot-credential-form',
  templateUrl: './form.component.html',
  styleUrls: ['./form.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    CdkMenuModule,
    DragDropModule,
    MatTooltipModule,
    MatInputModule,
    MatRadioModule,
    MatSlideToggleModule,
    NgmDensityDirective,
    NgmI18nPipe,
    NgmSelectComponent,
  ],
  hostDirectives: [NgxControlValueAccessor]
})
export class CopilotCredentialFormComponent {
  eCredentialFormTypeEnum = CredentialFormTypeEnum
  eParameterType = ParameterType

  readonly #translate = inject(TranslateService)
  readonly #fb = inject(FormBuilder)
  readonly #i18n = new NgmI18nPipe()
  protected cva = inject<NgxControlValueAccessor<Partial<Record<string, any>> | null>>(NgxControlValueAccessor)

  // Inputs
  readonly credentialFormSchemas = input<CredentialFormSchema[]>()
  readonly modelType = input<AiModelTypeEnum>()

  // Models
  readonly credentials = computed(() => this.cva.value$() ?? {})

  readonly credentialSchemas = computed(() => {
    return this.credentialFormSchemas()
     ?.filter((credential) => credential.show_on ? 
      credential.show_on.every((item) =>
        item.variable === AI_MODEL_TYPE_VARIABLE ? item.value === this.modelType()
          : this.credentials()?.[item.variable] === item.value
      ) : true
    )
    .map((credential) => {
      if (credential.options) {
        return {
          ...credential,
          options: credential.options.filter((option) => {
            if (option.show_on) {
              return option.show_on.every((item) =>
                item.variable === AI_MODEL_TYPE_VARIABLE ? item.value === this.modelType()
                  : this.credentials()?.[item.variable] === item.value
              )
            }
            return true
          })
        }
      }
      return credential
    })
  })

  readonly #invalid = computed(() => {
    return this.credentialSchemas().filter(credential => credential.required)
      .some(credential => isNil(this.cva.value$()?.[credential.variable]))
  })

  // Attrs
  get invalid() {
    return this.#invalid()
  }

  constructor() {
     // Waiting NgxControlValueAccessor has been initialized
    setTimeout(() => {
      if (this.cva.value$() === null) {
        const defaultValues = this.credentialFormSchemas().reduce((acc, credential) => {
          if (!isNil(credential.default)) {
            acc[credential.variable] = credential.default
          }
          return acc
        }, {} as Record<string, any>)
        // Waiting all controls have been initialized then update the default value, because other's value$() will be undefined (not null) when updated
        setTimeout(() => {
          this.cva.writeValue(defaultValues)
        })
      }
    })

  }

  updateValue(name: string, value: any) {
    this.cva.value$.update((credentials) => {
      return {
        ...credentials,
        [name]: value
      }
    })
  }
}
