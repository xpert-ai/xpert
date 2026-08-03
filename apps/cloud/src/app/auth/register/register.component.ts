import { HttpClient, HttpErrorResponse } from '@angular/common/http'
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject, OnDestroy } from '@angular/core'
import { AbstractControl, FormControl, UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms'
import { ActivatedRoute, Router } from '@angular/router'
import { TranslateService } from '@ngx-translate/core'
import { ReferralService } from '@cloud/app/@core/state'
import { firstValueFrom } from 'rxjs'
import { take } from 'rxjs'
import { NbAuthSocialLink, XP_AUTH_OPTIONS } from '../auth.options'
import { getDeepFromObject } from '../helpers'
import { matchValidator, XpAuthResult, XpAuthService, passwordStrength, PasswordStrengthEnum } from '../services'
import {
  clearRegistrationReferralCode,
  getRegistrationReferralCode,
  saveRegistrationReferralCode
} from '../referral-registration-session'

type CompleteSsoBindingResponse = {
  location: string
}

type SsoRegistrationChallengeBase = {
  provider: string
  displayName?: string
  avatarUrl?: string
  tenantScoped: true
  expiresAt: string
}

type AnonymousSsoRegistrationChallenge = SsoRegistrationChallengeBase & {
  flow?: 'anonymous_bind'
}

type VerifiedEmailSignupChallenge = SsoRegistrationChallengeBase & {
  flow: 'verified_email_signup'
  email: string
}

type SsoRegistrationChallengeView = AnonymousSsoRegistrationChallenge | VerifiedEmailSignupChallenge

type SSOProviderDescriptor = {
  provider: string
  displayName: string
  icon: string
  order: number
  startUrl: string
}

type SSOProviderDiscoveryResponse = {
  providers: SSOProviderDescriptor[]
}

@Component({
  standalone: false,
  selector: 'xp-register',
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
  ssoChallenge: SsoRegistrationChallengeView | null = null
  ssoChallengeLoading = false
  ssoChallengeLoadError = ''
  enablePublicSignup = true
  referralEnabled = false
  referralAvailabilityLoading = true
  referralValidationLoading = false
  referralValid: boolean | null = null
  ssoProviders: SSOProviderDescriptor[] = []

  constructor(
    protected service: XpAuthService,
    @Inject(XP_AUTH_OPTIONS) protected options = {},
    fb: UntypedFormBuilder,
    private http: HttpClient,
    private referralService: ReferralService,
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
        referralCode: [{ value: '', disabled: true }]
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
    this.ssoChallengeLoading = Boolean(this.ssoTicket)
    const queryReferralCode = this.route.snapshot.queryParamMap.get('ref')?.trim() ?? ''
    if (queryReferralCode) {
      saveRegistrationReferralCode(queryReferralCode)
    }
    this.form.controls.referralCode.setValue(queryReferralCode || getRegistrationReferralCode())
    this.enablePublicSignup = this.getConfigValue('forms.register.enablePublicSignup') !== false
    void this.loadReferralAvailability()
    void this.loadSsoProviders()
    if (this.ssoTicket) {
      void this.loadSsoRegistrationChallenge()
    }

    if (!this.ssoTicket && !this.enablePublicSignup) {
      void this.router.navigate(['/auth/login'])
    }
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
  get referralCode(): AbstractControl {
    return this.form.controls.referralCode
  }
  get verifiedEmailSignup(): boolean {
    return this.ssoChallenge?.flow === 'verified_email_signup'
  }
  get emailLocked(): boolean {
    return this.verifiedEmailSignup
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
    if (this.ssoTicket && (!this.ssoChallenge || this.ssoChallengeLoading || this.ssoChallengeLoadError)) {
      return
    }
    this.submitted = true
    if (!(await this.validateReferralCode())) {
      this.submitted = false
      this.cdr.detectChanges()
      return
    }
    const data = this.form.getRawValue()

    if (this.ssoTicket) {
      try {
        const result = await firstValueFrom(
          this.http.post<CompleteSsoBindingResponse>('/api/auth/sso/bind/register', {
            ticket: this.ssoTicket,
            email: data.email?.trim(),
            password: data.password,
            confirmPassword: data.confirm,
            referralCode: this.referralEnabled ? data.referralCode?.trim() || undefined : undefined
          })
        )

        clearRegistrationReferralCode()
        this.redirectToLocation(result.location)
        return
      } catch (error) {
        this.submitted = false
        this.errors = [this.resolveErrorMessage(error)]
        this.cdr.detectChanges()
        return
      }
    }

    this.service.register(this.strategy, data).subscribe((result: XpAuthResult) => {
      if (result.isSuccess()) {
        clearRegistrationReferralCode()
        this.messages = [
          this.getTranslation('Auth.SignupSuccess', {
            Default: '🎉 Signup success, please active the link in your email'
          })
        ]
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
    this.translateService
      .get(key, params)
      .pipe(take(1))
      .subscribe((value) => {
        t = value
      })
    return t
  }

  ngOnDestroy(): void {
    if (this.interval$) {
      clearInterval(this.interval$)
    }
  }

  async validateReferralCode(): Promise<boolean> {
    const code = this.referralCode.value?.trim().toUpperCase()
    if (!this.referralEnabled || !code) {
      this.referralValid = null
      this.referralCode.setErrors(null)
      return true
    }

    this.referralValidationLoading = true
    this.referralValid = null
    this.cdr.markForCheck()
    try {
      const valid = await this.referralService.validateCode(code)
      if (this.referralCode.value?.trim().toUpperCase() !== code) {
        return false
      }
      this.referralValid = valid
      this.referralCode.setErrors(valid ? null : { invalidReferralCode: true })
      if (valid) {
        saveRegistrationReferralCode(code)
      }
      return valid
    } catch {
      this.referralValid = false
      this.referralCode.setErrors({ invalidReferralCode: true })
      return false
    } finally {
      this.referralValidationLoading = false
      this.cdr.markForCheck()
    }
  }

  openProvider(provider: SSOProviderDescriptor): void {
    if (!provider.startUrl) {
      return
    }
    const code = this.referralCode.value?.trim()
    saveRegistrationReferralCode(this.referralEnabled ? code : '')
    window.location.assign(new URL(provider.startUrl, window.location.origin).toString())
  }

  navigateToLogin(): void {
    void this.router.navigate(['/auth/login'])
  }

  protected redirectToLocation(location: string): void {
    window.location.assign(location)
  }

  providerLabel(provider?: string | null): string {
    const providerId = provider?.trim()
    if (!providerId) {
      return 'SSO'
    }

    const displayName = this.ssoProviders.find((item) => item.provider === providerId)?.displayName.trim()

    return displayName || providerId
  }

  private async loadSsoRegistrationChallenge(): Promise<void> {
    this.ssoChallengeLoading = true
    this.ssoChallengeLoadError = ''
    this.ssoChallenge = null
    this.cdr.markForCheck()

    try {
      const challenge = await firstValueFrom(
        this.http.get<SsoRegistrationChallengeView>('/api/auth/sso/bind/challenge', {
          params: {
            ticket: this.ssoTicket
          }
        })
      )

      if (challenge.flow === 'verified_email_signup') {
        const email = challenge.email?.trim().toLowerCase()
        if (!email) {
          this.ssoChallengeLoadError = this.getTranslation('Auth.SSO_REGISTER.INVALID_SESSION', {
            Default: 'This registration session is invalid. Please start SSO sign-in again.'
          })
          return
        }
        this.email.setValue(email)
        this.email.markAsPristine()
        this.email.updateValueAndValidity({ emitEvent: false })
      }

      this.ssoChallenge = challenge
    } catch (error) {
      this.ssoChallengeLoadError = this.resolveErrorMessage(error)
    } finally {
      this.ssoChallengeLoading = false
      this.cdr.markForCheck()
    }
  }

  private async loadReferralAvailability() {
    try {
      this.referralEnabled = await this.referralService.getAvailability()
      if (this.referralEnabled) {
        this.referralCode.enable({ emitEvent: false })
        if (this.referralCode.value) {
          await this.validateReferralCode()
        }
      } else {
        this.referralCode.reset('', { emitEvent: false })
        clearRegistrationReferralCode()
      }
    } catch {
      this.referralEnabled = false
      this.referralCode.reset('', { emitEvent: false })
    } finally {
      this.referralAvailabilityLoading = false
      this.cdr.markForCheck()
    }
  }

  private async loadSsoProviders() {
    try {
      const result = await firstValueFrom(this.http.get<SSOProviderDiscoveryResponse>('/api/auth/sso/providers'))
      this.ssoProviders = result.providers ?? []
    } catch {
      this.ssoProviders = []
    } finally {
      this.cdr.markForCheck()
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

    return this.getTranslation('Auth.RegisterFail', {
      Default: 'Registration failed. Please try again later.'
    })
  }
}
