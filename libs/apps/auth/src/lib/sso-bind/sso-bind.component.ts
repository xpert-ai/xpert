import { HttpClient, HttpErrorResponse } from '@angular/common/http'
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, inject } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { AbstractControl, FormBuilder, FormGroup, Validators } from '@angular/forms'
import { ActivatedRoute, Router } from '@angular/router'
import { firstValueFrom } from 'rxjs'

type SsoBindChallengeView = {
  provider: string
  displayName?: string
  avatarUrl?: string
  tenantScoped: true
  expiresAt: string
}

type CompleteSsoBindingResponse = {
  location: string
}

@Component({
  standalone: false,
  selector: 'pac-sso-bind',
  templateUrl: './sso-bind.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SsoBindComponent {
  readonly #http = inject(HttpClient)
  readonly #route = inject(ActivatedRoute)
  readonly #router = inject(Router)
  readonly #cdr = inject(ChangeDetectorRef)
  readonly #destroyRef = inject(DestroyRef)

  readonly form: FormGroup

  ticket = ''
  challenge: SsoBindChallengeView | null = null
  mode: 'choice' | 'login' = 'choice'
  loading = true
  submitting = false
  loadError = ''
  submitError = ''

  get userName(): AbstractControl {
    return this.form.controls.userName
  }

  get password(): AbstractControl {
    return this.form.controls.password
  }

  constructor(formBuilder: FormBuilder) {
    this.form = formBuilder.group({
      userName: [null, [Validators.required]],
      password: [null, [Validators.required]]
    })

    this.#route.queryParamMap
      .pipe(takeUntilDestroyed(this.#destroyRef))
      .subscribe((params) => {
        this.ticket = params.get('ticket')?.trim() ?? ''
        void this.loadChallenge()
      })
  }

  async submit(): Promise<void> {
    this.submitError = ''
    this.userName.markAsDirty()
    this.userName.updateValueAndValidity()
    this.password.markAsDirty()
    this.password.updateValueAndValidity()

    if (!this.ticket || this.form.invalid || this.submitting) {
      return
    }

    this.submitting = true
    this.#cdr.markForCheck()

    try {
      const result = await firstValueFrom(
        this.#http.post<CompleteSsoBindingResponse>('/api/auth/sso/bind/complete', {
          ticket: this.ticket,
          userName: this.form.value.userName?.trim(),
          password: this.form.value.password
        })
      )

      window.location.assign(result.location)
      return
    } catch (error) {
      this.handleSubmitError(error)
    } finally {
      this.submitting = false
      this.#cdr.markForCheck()
    }
  }

  navigateToLogin(): void {
    void this.#router.navigate(['/auth/login'])
  }

  openExistingAccountForm(): void {
    this.mode = 'login'
    this.submitError = ''
    this.#cdr.markForCheck()
  }

  openRegister(): void {
    void this.#router.navigate(['/auth/register'], {
      queryParams: {
        ticket: this.ticket
      }
    })
  }

  providerLabel(provider?: string | null, displayName?: string | null): string {
    const normalizedDisplayName = displayName?.trim()
    if (normalizedDisplayName) {
      return normalizedDisplayName
    }

    return provider?.trim() || 'SSO'
  }

  private async loadChallenge(): Promise<void> {
    this.loading = true
    this.mode = 'choice'
    this.loadError = ''
    this.submitError = ''
    this.challenge = null
    this.#cdr.markForCheck()

    if (!this.ticket) {
      this.loading = false
      this.loadError = '会话已失效，请重新通过 SSO 登录。'
      this.#cdr.markForCheck()
      return
    }

    try {
      this.challenge = await firstValueFrom(
        this.#http.get<SsoBindChallengeView>('/api/auth/sso/bind/challenge', {
          params: {
            ticket: this.ticket
          }
        })
      )
    } catch (error) {
      this.loadError = this.resolveErrorMessage(
        error,
        '会话已失效，请重新通过 SSO 登录。'
      )
    } finally {
      this.loading = false
      this.#cdr.markForCheck()
    }
  }

  private handleSubmitError(error: unknown): void {
    const httpError = error as HttpErrorResponse
    const status = httpError?.status

    if (status === 400) {
      const message = this.resolveErrorMessage(error, '会话已失效，请重新通过 SSO 登录。')
      if (message.includes('失效') || message.toLowerCase().includes('expired')) {
        this.challenge = null
        this.loadError = message
        return
      }
      this.submitError = message
      return
    }

    if (status === 401) {
      this.submitError = '账号或密码错误，请重试。'
      return
    }

    if (status === 409) {
      this.submitError = this.resolveErrorMessage(
        error,
        '绑定冲突，请联系管理员处理。'
      )
      return
    }

    this.submitError = this.resolveErrorMessage(error, '绑定失败，请稍后重试。')
  }

  private resolveErrorMessage(error: unknown, fallback: string): string {
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

    if (typeof httpError?.message === 'string' && httpError.message.trim().length > 0) {
      return httpError.message.trim()
    }

    return fallback
  }
}
