import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  Inject,
  OnDestroy,
  inject
} from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { AbstractControl, FormBuilder, FormGroup, Validators } from '@angular/forms'
import { ActivatedRoute, ParamMap, Router } from '@angular/router'
import { CookieService } from 'ngx-cookie-service'
import { firstValueFrom } from 'rxjs'
import { catchError, map } from 'rxjs/operators'
import { of } from 'rxjs'
import { PAC_AUTH_OPTIONS } from '../auth.options'
import { getDeepFromObject } from '../helpers'
import { PacAuthService } from '../services/auth.service'

type SSOProviderDescriptor = {
  provider: string
  displayName: string
  icon: string
  order: number
  startUrl: string
}

type SSOProviderDiscoveryResponse = {
  fallbackApplied: boolean
  providers: SSOProviderDescriptor[]
}

@Component({
  standalone: false,
  selector: 'pac-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
  providers: [],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserLoginComponent implements OnDestroy {
  readonly #http = inject(HttpClient)
  readonly #destroyRef = inject(DestroyRef)

  showMessages: any = {}

  redirectDelay = 0
  strategy = ''

  errors: string[] = []
  messages: string[] = []

  get userName(): AbstractControl {
    return this.form.controls.userName
  }
  get password(): AbstractControl {
    return this.form.controls.password
  }
  get mobile(): AbstractControl {
    return this.form.controls.mobile
  }
  get captcha(): AbstractControl {
    return this.form.controls.captcha
  }
  form: FormGroup
  type = 0
  loading = false

  count = 0
  interval$: any

  /**
   * Signals
   */
  readonly ssoProviders = toSignal(
    this.#http.get<SSOProviderDiscoveryResponse>('/api/auth/sso/providers').pipe(
      map((result) => result.providers ?? []),
      catchError(() => of([] as SSOProviderDescriptor[]))
    ),
    { initialValue: [] as SSOProviderDescriptor[] }
  )

  constructor(
    private readonly cookieService: CookieService,
    @Inject(PAC_AUTH_OPTIONS) protected options = {},
    fb: FormBuilder,
    private authService: PacAuthService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {
    this.form = fb.group({
      userName: [null, [Validators.required]],
      password: [null, [Validators.required]],
      // mobile: [null, [Validators.required, Validators.pattern(/^1\d{10}$/)]],
      // captcha: [null, [Validators.required]],
      rememberMe: [true]
    })

    this.checkRememberdMe()

    this.showMessages = this.getConfigValue('forms.login.showMessages')
    this.redirectDelay = this.getConfigValue('forms.login.redirectDelay')
    this.strategy = this.getConfigValue('forms.login.strategy')

    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.#destroyRef))
      .subscribe((params) => {
        this.errors = this.resolveSsoErrors(params)
        this.cdr.markForCheck()
      })
  }

  /**
   * Implemented Rememberd Me Feature
   */
  checkRememberdMe() {
    if (this.cookieService.check('rememberMe')) {
      const { email, rememberMe } = this.cookieService.getAll()
      this.form.patchValue({
        userName: email,
        rememberMe
      })
    }
  }

  getCaptcha(): void {
    if (this.mobile.invalid) {
      this.mobile.markAsDirty({ onlySelf: true })
      this.mobile.updateValueAndValidity({ onlySelf: true })
      return
    }
    this.count = 59
    this.interval$ = setInterval(() => {
      this.count -= 1
      if (this.count <= 0) {
        clearInterval(this.interval$)
      }
    }, 1000)
  }

  async submit() {
    this.errors = []
    if (this.type === 0) {
      this.userName.markAsDirty()
      this.userName.updateValueAndValidity()
      this.password.markAsDirty()
      this.password.updateValueAndValidity()
      if (this.userName.invalid || this.password.invalid) {
        return
      }
    } else {
      this.mobile.markAsDirty()
      this.mobile.updateValueAndValidity()
      this.captcha.markAsDirty()
      this.captcha.updateValueAndValidity()
      if (this.mobile.invalid || this.captcha.invalid) {
        return
      }
    }

    this.loading = true
    this.cdr.detectChanges()

    try {
      const result = await firstValueFrom(
        this.authService.authenticate(this.strategy, {
          ...this.form.value,
          userName: this.form.value.userName?.toLowerCase()
        })
      )

      if (result.isSuccess()) {
        this.messages = result.getMessages()
      } else {
        this.errors = result.getErrors()
      }

      const redirect = this.route.snapshot.queryParams.returnUrl || result.getRedirect()
      if (redirect) {
        setTimeout(() => {
          return this.router.navigateByUrl(redirect)
        }, this.redirectDelay)
      }
      this.loading = false
      this.cdr.detectChanges()
    } catch (err) {
      this.loading = false
      this.cdr.detectChanges()
    }
  }

  openProvider(provider: SSOProviderDescriptor): void {
    if (!provider?.startUrl) {
      return
    }

    const startUrl = new URL(provider.startUrl, window.location.origin)
    const returnTo = this.route.snapshot.queryParams.returnUrl

    if (typeof returnTo === 'string' && returnTo.trim().length > 0) {
      startUrl.searchParams.set('returnTo', returnTo.trim())
    }

    window.location.assign(startUrl.toString())
  }

  getConfigValue(key: string): any {
    return getDeepFromObject(this.options, key, null)
  }

  private resolveSsoErrors(params: ParamMap): string[] {
    const ssoMessage = params.get('ssoMessage')?.trim()
    if (ssoMessage) {
      return [ssoMessage]
    }

    const ssoError = params.get('ssoError')?.trim()
    if (!ssoError) {
      return []
    }

    return [`${this.resolveSsoProviderLabel(params.get('ssoProvider'))} sign-in failed. Please try again.`]
  }

  private resolveSsoProviderLabel(provider?: string | null): string {
    const normalizedProvider = provider?.trim()
    if (!normalizedProvider) {
      return 'SSO'
    }

    return (
      this.ssoProviders()
        .find((item) => item.provider === normalizedProvider)
        ?.displayName?.trim() || normalizedProvider
    )
  }

  ngOnDestroy(): void {
    if (this.interval$) {
      clearInterval(this.interval$)
    }
  }
}
