import { HttpClient, HttpErrorResponse } from '@angular/common/http'
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, inject } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
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
  selector: 'pac-current-user-sso-confirm',
  templateUrl: './current-user-sso-confirm.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CurrentUserSsoConfirmComponent {
  readonly #http = inject(HttpClient)
  readonly #route = inject(ActivatedRoute)
  readonly #router = inject(Router)
  readonly #cdr = inject(ChangeDetectorRef)
  readonly #destroyRef = inject(DestroyRef)

  ticket = ''
  challenge: SsoBindChallengeView | null = null
  loading = true
  submitting = false
  loadError = ''
  submitError = ''

  constructor() {
    this.#route.queryParamMap
      .pipe(takeUntilDestroyed(this.#destroyRef))
      .subscribe((params) => {
        this.ticket = params.get('ticket')?.trim() ?? ''
        void this.loadChallenge()
      })
  }

  async submit(): Promise<void> {
    if (!this.ticket || this.submitting) {
      return
    }

    this.submitError = ''
    this.submitting = true
    this.#cdr.markForCheck()

    try {
      const result = await firstValueFrom(
        this.#http.post<CompleteSsoBindingResponse>('/api/auth/sso/bind/current-user/complete', {
          ticket: this.ticket
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

  providerLabel(provider?: string | null, displayName?: string | null): string {
    const normalizedDisplayName = displayName?.trim()
    if (normalizedDisplayName) {
      return normalizedDisplayName
    }

    return provider?.trim() || 'SSO'
  }

  private async loadChallenge(): Promise<void> {
    this.loading = true
    this.loadError = ''
    this.submitError = ''
    this.challenge = null
    this.#cdr.markForCheck()

    if (!this.ticket) {
      this.loading = false
      this.loadError = '会话已失效，请重新发起绑定。'
      this.#cdr.markForCheck()
      return
    }

    try {
      this.challenge = await firstValueFrom(
        this.#http.get<SsoBindChallengeView>('/api/auth/sso/bind/current-user/challenge', {
          params: {
            ticket: this.ticket
          }
        })
      )
    } catch (error) {
      if ((error as HttpErrorResponse)?.status === 401) {
        this.loadError = '登录状态已失效，请重新登录后再试。'
      } else {
      this.loadError = this.resolveErrorMessage(error, '会话已失效，请重新发起绑定。')
      }
    } finally {
      this.loading = false
      this.#cdr.markForCheck()
    }
  }

  private handleSubmitError(error: unknown): void {
    const httpError = error as HttpErrorResponse
    const status = httpError?.status

    if (status === 400) {
      this.challenge = null
      this.loadError = this.resolveErrorMessage(error, '会话已失效，请重新发起绑定。')
      return
    }

    if (status === 401) {
      this.submitError = '登录状态已失效，请重新登录后再试。'
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
