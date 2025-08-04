import { CommonModule } from '@angular/common'
import { Component, ElementRef, forwardRef, inject, ViewChild } from '@angular/core'
import { ControlValueAccessor, FormGroup, FormsModule, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms'
import { AuthService } from '@metad/cloud/state'
import { IUser } from '@metad/contracts'
import { DisplayBehaviour } from '@metad/ocap-core'
import { FORMLY_ROW, FORMLY_W_1_2 } from '@metad/story/designer'
import { FormlyFieldConfig, FormlyModule } from '@ngx-formly/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import { Store } from '../../../../@core'

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TranslateModule, FormlyModule],
  selector: 'pac-user-change-password-form',
  templateUrl: 'change-password.component.html',
  styleUrls: ['change-password.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => UserChangePasswordFormComponent)
    }
  ]
})
export class UserChangePasswordFormComponent implements ControlValueAccessor {
  eDisplayBehaviour = DisplayBehaviour

  readonly #store = inject(Store)
  readonly #authService = inject(AuthService)
  readonly #translate = inject(TranslateService)

  @ViewChild('imagePreview')
  imagePreviewElement: ElementRef

  //Fields for the form
  public form = new FormGroup({})
  model = {} as any
  fields: FormlyFieldConfig[] = []

  get invalid() {
    return this.form.invalid
  }

  onChange: (value: any) => any

  writeValue(obj: any): void {
    if (obj) {
      this.form.patchValue(obj)
      this.model = obj
    }
  }
  registerOnChange(fn: any): void {
    this.onChange = fn
  }
  registerOnTouched(fn: any): void {}
  setDisabledState?(isDisabled: boolean): void {}

  ngOnInit() {
    const TRANSLATES = this.#translate.instant('PAC.SHARED.USER_BASIC')
    this.fields = [
      {
        fieldGroupClassName: FORMLY_ROW,
        fieldGroup: [
          {
            className: FORMLY_W_1_2,
            key: 'password',
            type: 'input',
            props: {
              label: TRANSLATES?.Passwrod ?? 'Passwrod',
              placeholder: '',
              type: 'password',
              required: true,
              appearance: 'fill',
              minLength: 8
            }
          },
          {
            className: FORMLY_W_1_2,
            key: 'confirmPassword',
            type: 'input',
            props: {
              label: TRANSLATES?.RepeatPasswrod ?? 'Repeat Passwrod',
              placeholder: '',
              type: 'password',
              required: true,
              appearance: 'fill',
              minLength: 8
            },
            validators: {
              fieldMatch: {
                expression: (control) => {
                  const password = control.parent?.get('password')?.value
                  const confirmPassword = control.value
                  return password === confirmPassword
                },
                message: (error, field: FormlyFieldConfig) =>
                  this.#translate.instant('PAC.KEY_WORDS.PasswordsNotMatch', { Default: 'Passwords do not match' })
              }
            }
          }
        ]
      }
    ]
  }

  onFormChange(model: any) {
    this.onChange?.(model)
  }

  async registerUser(organizationId?: string, createdById?: string) {
    if (this.form.valid) {
      const { tenant } = this.#store.user
      const user: IUser = {
        ...this.model,
        tenantId: tenant.id
      }

      return await firstValueFrom(
        this.#authService.register({
          user,
          // password: this.model.password,
          // confirmPassword: this.model.confirmPassword,
          organizationId,
          createdById,
          timeZone: this.model.timeZone
        })
      )
    }

    return null
  }
}
