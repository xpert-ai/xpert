import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core'
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { MatInputModule } from '@angular/material/input'
import { MatRadioModule } from '@angular/material/radio'
import { MatTooltipModule } from '@angular/material/tooltip'
import { isNil } from '@metad/copilot'
import { NgmDensityDirective, NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { CredentialFormSchema, CredentialFormTypeEnum, ParameterType } from '../../../@core'
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
    NgmSelectComponent
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

  readonly credentialFormSchemas = input<CredentialFormSchema[]>()

  readonly formGroup = this.#fb.group({})

  readonly credentials = signal<CredentialFormSchema[]>([])

  private valueSub = this.formGroup.valueChanges.subscribe((value) => {
    this.cva.writeValue(value)
  })

  get invalid() {
    return this.formGroup.invalid
  }

  constructor() {
    effect(
      () => {
        if (this.credentialFormSchemas()) {
          // Clear
          Object.keys(this.formGroup.controls).forEach((key) => this.formGroup.removeControl(key))

          this.credentialFormSchemas().forEach((credential) => {
            if (credential.required) {
              this.formGroup.addControl(credential.variable, this.#fb.control(null, [Validators.required]))
            } else {
              this.formGroup.addControl(credential.variable, this.#fb.control(null))
            }
          })

          const defaultValue = this.credentialFormSchemas().reduce((acc, credential) => {
            if (!isNil(credential.default)) {
              acc[credential.variable] = credential.default
            }
            return acc
          }, {})

          this.formGroup.patchValue(defaultValue)
          this.formGroup.markAsPristine()

          this.credentials.set(this.credentialFormSchemas())
        }
      },
      { allowSignalWrites: true }
    )

    effect(
      () => {
        this.formGroup.patchValue(this.cva.value$(), { emitEvent: false })
      },
      { allowSignalWrites: true }
    )
  }
}
