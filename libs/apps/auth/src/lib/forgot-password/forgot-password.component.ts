import { ChangeDetectorRef, Component, inject } from '@angular/core'
import { FormControl, FormGroup, Validators } from '@angular/forms'
import { MatSnackBar } from '@angular/material/snack-bar'
import { TranslateService } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import { PAC_AUTH_OPTIONS } from '../auth.options'
import { getDeepFromObject } from '../helpers'
import { PacAuthResult, PacAuthService } from '../services'

@Component({
  standalone: false,
  selector: 'pac-auth-forgot-password',
  templateUrl: 'forgot-password.component.html',
  styleUrls: ['forgot-password.component.scss']
})
export class ForgotPasswordComponent {
  private authService = inject(PacAuthService)
  protected options = inject(PAC_AUTH_OPTIONS)
  private translateService = inject(TranslateService)
  private _snackBar = inject(MatSnackBar)
  private _cdr = inject(ChangeDetectorRef)

  strategy = this.getConfigValue('forms.login.strategy')
  form = new FormGroup({
    email: new FormControl<string>(null, [Validators.required])
  })
  submitted = false

  async requestPass() {
    this.submitted = true

    try {
      const result: PacAuthResult = await firstValueFrom(
        this.authService.requestPassword(this.strategy, this.form.value)
      )

      if (result.isFailure()) {
        throw new Error(result.getErrors()[0])
      }

      let REQUEST_SUCCESS = ''
      this.translateService
        .get('Auth.RequestPasswordSuccess', { Default: 'Request Password Success' })
        .subscribe((value) => {
          REQUEST_SUCCESS = value
        })

      this._snackBar.open(REQUEST_SUCCESS, '', { duration: 2000 })
    } catch (err) {
      this.submitted = false
      this._cdr.detectChanges()

      let REQUEST_FAIL = ''
      this.translateService.get('Auth.RequestPasswordFail', { Default: 'Request Password Fail' }).subscribe((value) => {
        REQUEST_FAIL = value
      })

      this._snackBar.open(REQUEST_FAIL, '', { duration: 2000 })
    }
  }

  getConfigValue(key: string): any {
    return getDeepFromObject(this.options, key, null)
  }
}
