import { HttpClient, HttpErrorResponse } from '@angular/common/http'
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject, OnDestroy } from '@angular/core'
import { AbstractControl, FormControl, UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms'
import { ActivatedRoute, Router } from '@angular/router'
import { TranslateService } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import { take } from 'rxjs'
import { NbAuthSocialLink, PAC_AUTH_OPTIONS } from '../auth.options'
import { getDeepFromObject } from '../helpers'
import { matchValidator, PacAuthResult, PacAuthService, passwordStrength, PasswordStrengthEnum } from '../services'

type CompleteSsoBindingResponse = {
  location: string
}

@Component({
  standalone: false,
  selector: 'pac-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserRegisterComponent implements OnDestroy {
  redirectDelay = 0
  showMessages: any = {}
  strategy = ''

  submitted = false
  errors: string[] = []
  messages: string[] = []
  socialLinks: NbAuthSocialLink[] = []
  ssoTicket = ''

  constructor(
    protected service: PacAuthService,
    @Inject(PAC_AUTH_OPTIONS) protected options = {},
    fb: UntypedFormBuilder,
    private http: HttpClient,
    private translateService: TranslateService,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {
    this.form = fb.group(
      {
        email: [null, [Validators.required, Validators.email]],
        password: [
          null,
          [Validators.required, Validators.minLength(6), UserRegisterComponent.checkPassword.bind(this)]
        ],
        confirm: [null, [Validators.required, Validators.minLength(6)]],
        // mobilePrefix: ['+86'],
        // mobile: [null, [Validators.required, Validators.pattern(/^1\d{10}$/)]],
        // captcha: [null, [Validators.required]]
      },
      {
        validators: [matchValidator('password', 'confirm')]
      }
    )

    this.redirectDelay = this.getConfigValue('forms.register.redirectDelay')
    this.showMessages = this.getConfigValue('forms.register.showMessages')
    this.strategy = this.getConfigValue('forms.register.strategy')
    this.socialLinks = this.getConfigValue('forms.login.socialLinks')
    this.ssoTicket = this.route.snapshot.queryParamMap.get('ticket')?.trim() ?? ''
  }

  // #region fields

  get email(): AbstractControl {
    return this.form.controls.email
  }
  get password(): AbstractControl {
    return this.form.controls.password
  }
  get confirm(): AbstractControl {
    return this.form.controls.confirm
  }
  get mobile(): AbstractControl {
    return this.form.controls.mobile
  }
  get captcha(): AbstractControl {
    return this.form.controls.captcha
  }
  form: UntypedFormGroup
  error = ''
  type = 0
  loading = false
  visible = false
  status = 'pool'
  progress = 0
  passwordProgressMap: { [key: string]: {color: 'success' | 'normal' | 'accent' | 'warn', progress: number} } = {
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
    },
  }

  count = 0
  interval$: any

  get mismatch() {
    return this.form.hasError('mismatch') && this.form.get('confirm').dirty
  }

  static checkPassword(control: FormControl) {
    if (!control) {
      return null
    }
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self: any = this
    self.visible = !!control.value
    if (self.visible) {
      const result = passwordStrength(control.value)
      self.status = result.value
    } else {
      self.status = null
    }
  }

  getCaptcha(): void {
    if (this.mobile.invalid) {
      this.mobile.markAsDirty({ onlySelf: true })
      this.mobile.updateValueAndValidity({ onlySelf: true })
      return
    }
    this.count = 59
    this.cdr.detectChanges()
    this.interval$ = setInterval(() => {
      this.count -= 1
      this.cdr.detectChanges()
      if (this.count <= 0) {
        clearInterval(this.interval$)
      }
    }, 1000)
  }

  async register(): Promise<void> {
    this.errors = this.messages = []
    this.submitted = true
    const data = this.form.value

    if (this.ssoTicket) {
      try {
        const result = await firstValueFrom(
          this.http.post<CompleteSsoBindingResponse>('/api/auth/sso/bind/register', {
            ticket: this.ssoTicket,
            email: data.email?.trim(),
            password: data.password,
            confirmPassword: data.confirm
          })
        )

        window.location.assign(result.location)
        return
      } catch (error) {
        this.submitted = false
        this.errors = [this.resolveErrorMessage(error)]
        this.cdr.detectChanges()
        return
      }
    }

    this.service.register(this.strategy, data).subscribe((result: PacAuthResult) => {
      if (result.isSuccess()) {
        this.messages = [this.getTranslation('Auth.SignupSuccess', {Default: '🎉 Signup success, please active the link in your email'})]
      } else {
        this.submitted = false
        this.errors = result.getErrors()
      }

      const redirect = result.getRedirect()
      if (redirect) {
        setTimeout(() => {
          return this.router.navigateByUrl(redirect)
        }, this.redirectDelay)
      }
      this.cdr.detectChanges()
    })
  }

  getConfigValue(key: string): any {
    return getDeepFromObject(this.options, key, null)
  }

  getTranslation(key: string, params: any) {
    let t = ''
    this.translateService.get(key, params).pipe(take(1)).subscribe((value) => {
      t = value
    })
    return t
  }

  ngOnDestroy(): void {
    if (this.interval$) {
      clearInterval(this.interval$)
    }
  }

  private resolveErrorMessage(error: unknown): string {
    const httpError = error as HttpErrorResponse
    const payload = httpError?.error

    if (typeof payload === 'string' && payload.trim().length > 0) {
      return payload.trim()
    }

    if (typeof payload?.message === 'string' && payload.message.trim().length > 0) {
      return payload.message.trim()
    }

    if (Array.isArray(payload?.message) && payload.message.length > 0) {
      return payload.message.join('\n')
    }

    if (typeof payload?.error === 'string' && payload.error.trim().length > 0) {
      return payload.error.trim()
    }

    return '注册失败，请稍后重试。'
  }
}
