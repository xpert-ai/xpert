import { HttpErrorResponse } from '@angular/common/http'
import { Component, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { UsersService } from '@cloud/app/@core/state'
import { TranslateModule } from '@ngx-translate/core'
import {
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardFormFieldComponent,
  ZardFormLabelComponent,
  ZardIconComponent,
  ZardInputDirective
} from '@xpert-ai/headless-ui'
import { EyeOff } from 'lucide-angular'
import { firstValueFrom } from 'rxjs'
import { matchValidator } from '../../../auth/services/validators'
import { HttpStatus, Store, ToastrService, getErrorMessage } from '../../../@core'

type PasswordField = 'hash' | 'password' | 'confirmPassword'

@Component({
  standalone: true,
  selector: 'xp-account-password',
  templateUrl: './password.component.html',
  imports: [
    ReactiveFormsModule,
    TranslateModule,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardFormFieldComponent,
    ZardFormLabelComponent,
    ZardIconComponent,
    ZardInputDirective
  ]
})
export class XpAccountPasswordComponent {
  private readonly userService = inject(UsersService)
  private readonly toastr = inject(ToastrService)
  readonly user = toSignal(inject(Store).user$)
  readonly loading = signal(false)
  readonly eyeOffIcon = EyeOff
  readonly revealed = signal({ hash: false, password: false, confirmPassword: false })
  readonly fields = [
    { key: 'hash', label: 'XP.PasswordSettings.CurrentPassword', autocomplete: 'current-password' },
    { key: 'password', label: 'XP.PasswordSettings.NewPassword', autocomplete: 'new-password' },
    { key: 'confirmPassword', label: 'XP.PasswordSettings.ConfirmPassword', autocomplete: 'new-password' }
  ] as const
  readonly passwordForm = new FormGroup(
    {
      hash: new FormControl('', { nonNullable: true, validators: Validators.required }),
      password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(8)] }),
      confirmPassword: new FormControl('', { nonNullable: true, validators: Validators.required })
    },
    { validators: matchValidator('password', 'confirmPassword') }
  )

  fieldError(key: PasswordField): string | null {
    const control = this.passwordForm.controls[key]
    if (!control.touched) {
      return null
    }
    if (control.hasError('required')) {
      return {
        hash: 'XP.PasswordSettings.CurrentRequired',
        password: 'XP.PasswordSettings.NewRequired',
        confirmPassword: 'XP.PasswordSettings.ConfirmationRequired'
      }[key]
    }
    if (control.hasError('minlength')) {
      return 'XP.PasswordSettings.MinLength'
    }
    if (key === 'confirmPassword' && this.passwordForm.hasError('mismatch')) {
      return 'XP.PasswordSettings.MustMatch'
    }
    if (key === 'hash' && control.hasError('error')) {
      return 'XP.PasswordSettings.CurrentRejected'
    }
    return null
  }

  describedBy(key: PasswordField): string | null {
    if (this.fieldError(key)) {
      return `password-${key}-error`
    }
    return key === 'password' ? 'password-requirement' : null
  }

  toggleVisibility(key: PasswordField) {
    this.revealed.update((state) => ({ ...state, [key]: !state[key] }))
  }

  clear() {
    if (!this.loading()) {
      this.passwordForm.reset()
      this.revealed.set({ hash: false, password: false, confirmPassword: false })
    }
  }

  async resetPassword() {
    if (this.loading()) {
      return
    }
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched()
      return
    }
    if (this.passwordForm.pristine || !this.user()?.id) {
      return
    }

    const { hash, password } = this.passwordForm.getRawValue()
    this.loading.set(true)
    try {
      await firstValueFrom(this.userService.password(this.user().id, { hash, password }))
      this.passwordForm.reset()
      this.revealed.set({ hash: false, password: false, confirmPassword: false })
      this.toastr.success('XP.MESSAGE.PasswordChange', { Default: 'Password change' })
    } catch (error) {
      this.toastr.error(getErrorMessage(error))
      if (error instanceof HttpErrorResponse && error.status === HttpStatus.FORBIDDEN) {
        this.passwordForm.controls.hash.setErrors({ error: true })
        this.passwordForm.controls.hash.markAsTouched()
      }
    } finally {
      this.loading.set(false)
    }
  }
}
