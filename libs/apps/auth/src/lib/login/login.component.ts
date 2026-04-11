import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Inject,
  OnDestroy,
  computed,
  inject
} from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { AbstractControl, FormBuilder, FormGroup, Validators } from '@angular/forms'
import { ActivatedRoute, Router } from '@angular/router'
import { Store } from '@xpert-ai/cloud/state'
import { CookieService } from 'ngx-cookie-service'
import { firstValueFrom } from 'rxjs'
import { PAC_API_BASE_URL, PAC_AUTH_OPTIONS } from '../auth.options'
import { getDeepFromObject } from '../helpers'
import { PacAuthService } from '../services/auth.service'

@Component({
  standalone: false,
  selector: 'pac-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
  providers: [],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserLoginComponent implements OnDestroy {
  readonly #store = inject(Store)
  readonly API_BASE_URL = inject(PAC_API_BASE_URL)

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
  readonly tenantSettings = toSignal(this.#store.tenantSettings$)
  readonly enableDingtalk = computed(() => this.tenantSettings()?.tenant_enable_dingtalk)
  readonly enableFeishu = computed(() => this.tenantSettings()?.tenant_enable_feishu)
  readonly enableGithub = computed(() => this.tenantSettings()?.tenant_enable_github)

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

  open(type: string, openType = 'href'): void {
    window.open(this.API_BASE_URL + `/api/auth/${type}`, '_self')
  }

  getConfigValue(key: string): any {
    return getDeepFromObject(this.options, key, null)
  }

  ngOnDestroy(): void {
    if (this.interval$) {
      clearInterval(this.interval$)
    }
  }
}
