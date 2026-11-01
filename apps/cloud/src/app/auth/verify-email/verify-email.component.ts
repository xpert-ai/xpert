import { HttpErrorResponse } from '@angular/common/http'
import { ChangeDetectorRef, Component, inject } from '@angular/core'
import { ActivatedRoute } from '@angular/router'
import { TranslateService } from '@ngx-translate/core'
import { AuthService } from '@cloud/app/@core/state'
import { map, startWith, switchMap } from 'rxjs/operators'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { XP_AUTH_OPTIONS } from '../auth.options'
import { getDeepFromObject } from '../helpers'

@Component({
  standalone: false,
  selector: 'xp-auth-varify-email',
  templateUrl: 'varify-email.component.html',
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
      }
    `
  ]
})
export class VarifyEmailComponent {
  private readonly authService = inject(AuthService)
  private readonly route = inject(ActivatedRoute)
  private readonly translateService = inject(TranslateService)
  private readonly _cdr = inject(ChangeDetectorRef)
  private readonly options = inject(XP_AUTH_OPTIONS)

  messages: string[] = []
  errors: string[] = []
  enablePublicSignup = this.getConfigValue('forms.register.enablePublicSignup') !== false

  private tokenSub = this.route.queryParams
    .pipe(
      startWith(this.route.snapshot.queryParams),
      map((params) => params['token']),
      switchMap((token) => this.authService.verifyEmail(token)),
      takeUntilDestroyed()
    )
    .subscribe({
      next: () => {
        this.errors = []
        this.messages = [
          this.getTranslation('Auth.VarifyEmailSuccess', { Default: 'Email verified successfully. Please sign in.' })
        ]

        this._cdr.detectChanges()
      },
      error: (err: unknown) => {
        this.messages = []
        this.errors = [this.getVerificationError(err)]
        this._cdr.detectChanges()
      }
    })

  private getVerificationError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 404 || error.status === 410) {
        return this.getTranslation('Auth.VerifyEmailInvalidLink', {
          Default: 'This verification link is invalid or has expired. Please open the latest link from your email.'
        })
      }

      const body: unknown = error.error
      const message = typeof body === 'object' && body !== null && 'message' in body ? body.message : body
      if (typeof message === 'string' && message.trim()) {
        return message.trim()
      }
      if (Array.isArray(message)) {
        const messages = message.filter((item): item is string => typeof item === 'string' && !!item.trim())
        if (messages.length) {
          return messages.join(' ')
        }
      }
    }

    return this.getTranslation('Auth.VerifyEmailFailed', {
      Default: 'Email verification failed. Please try again later.'
    })
  }

  getTranslation(key: string, params: any) {
    return this.translateService.instant(key, params)
  }

  getConfigValue(key: string): any {
    return getDeepFromObject(this.options, key, null)
  }
}
