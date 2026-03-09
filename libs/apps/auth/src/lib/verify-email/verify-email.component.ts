import { ChangeDetectorRef, Component, inject } from '@angular/core'
import { ActivatedRoute } from '@angular/router'
import { TranslateService } from '@ngx-translate/core'
import { AuthService } from '@metad/cloud/state'
import { map, startWith, switchMap } from 'rxjs/operators'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'

@Component({
  standalone: false,
  selector: 'pac-auth-varify-email',
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

  messages = []
  errors = []

  private tokenSub = this.route.queryParams
    .pipe(
      startWith(this.route.snapshot.queryParams),
      map((params) => params['token']),
      switchMap((token) => this.authService.verifyEmail(token)),
      takeUntilDestroyed()
    )
    .subscribe({
      next: () => {
        this.messages = [
          this.getTranslation('Auth.VarifyEmailSuccess', { Default: 'Email varify success, please go to login!' })
        ]

        this._cdr.detectChanges()
      },
      error: (err) => {
        this.messages = [err.error]
        this._cdr.detectChanges()
      }
    })

  getTranslation(key: string, params: any) {
    return this.translateService.instant(key, params)
  }
}
