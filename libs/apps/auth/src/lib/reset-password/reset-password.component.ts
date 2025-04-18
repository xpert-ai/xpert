import { ChangeDetectorRef, Component, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormGroup, Validators } from '@angular/forms'
import { MatSnackBar } from '@angular/material/snack-bar'
import { Router } from '@angular/router'
import { TranslateService } from '@ngx-translate/core'
import { delay, map, tap } from 'rxjs'
import { PAC_AUTH_OPTIONS } from '../auth.options'
import { getDeepFromObject } from '../helpers'
import { PacAuthResult, PacAuthService, PasswordStrengthEnum, matchValidator, passwordStrength } from '../services'

@Component({
  selector: 'pac-reset-password',
  templateUrl: 'reset-password.component.html',
  styleUrls: ['reset-password.component.scss']
})
export class ResetPasswordComponent {
  readonly #authService = inject(PacAuthService)
  protected options = inject(PAC_AUTH_OPTIONS)
  readonly translateService = inject(TranslateService)
  readonly _snackBar = inject(MatSnackBar)
  readonly router = inject(Router)
  readonly _cdr = inject(ChangeDetectorRef)

  strategy = this.getConfigValue('forms.login.strategy')
  form = new FormGroup(
    {
      password: new FormControl<string | null>(null, [
        Validators.required,
        Validators.minLength(8)
        // (control: AbstractControl): ValidationErrors | null => {
        //   const value: string = control.value || ''
        //   const status = passwordStrength(value).value
        //   return status === PasswordStrengthEnum.Weak ? null : { strength: status }
        // }
      ]),
      confirmPassword: new FormControl<string>(null)
    },
    {
      validators: [matchValidator('password', 'confirmPassword')]
    }
  )

  submitted = false

  passwordProgressMap: { [key: string]: { color: 'success' | 'normal' | 'accent' | 'warn'; progress: number } } = {
    [PasswordStrengthEnum.Strong]: {
      color: 'success',
      progress: 100
    },
    [PasswordStrengthEnum.Medium]: {
      color: 'normal',
      progress: 60
    },
    [PasswordStrengthEnum.Weak]: {
      color: 'accent',
      progress: 30
    },
    [PasswordStrengthEnum.Tooweak]: {
      color: 'warn',
      progress: 10
    }
  }

  get passwordControl() {
    return this.form.get('password')
  }

  // get strength() {
  //   return this.passwordControl.getError('strength') ?? PasswordStrengthEnum.Strong
  // }

  get mismatch() {
    return this.form.hasError('mismatch') && this.form.get('confirmPassword').dirty
  }

  readonly strength = toSignal(
    this.passwordControl.valueChanges.pipe(
      map((password) => {
        const value: string = password || ''
        return passwordStrength(value).value
      })
    )
  )

  resetPass() {
    this.submitted = true
    this.#authService
      .resetPassword(this.strategy, this.form.value)
      .pipe(
        tap((result: PacAuthResult) => {
          if (result.isSuccess()) {
            let RESET_SUCCESS = ''
            this.translateService
              .get('Auth.ResetPasswordSuccess', { Default: 'Reset Password Success' })
              .subscribe((value) => {
                RESET_SUCCESS = value
              })
            this._snackBar.open(RESET_SUCCESS, '', { duration: 2000 })
          } else {
            throw new Error(result.getErrors()[0])
          }
        }),
        delay(2000)
      )
      .subscribe({
        next: () => {
          this.router.navigate(['/auth/login'])
        },
        error: (err) => {
          this.submitted = false
          this._cdr.detectChanges()

          let RESET_FAIL = ''
          this.translateService.get('Auth.ResetPasswordFail', { Default: 'Reset Password Fail' }).subscribe((value) => {
            RESET_FAIL = value
          })
          this._snackBar.open(RESET_FAIL, '', { duration: 2000 })
        }
      })
  }

  getConfigValue(key: string): any {
    return getDeepFromObject(this.options, key, null)
  }
}
