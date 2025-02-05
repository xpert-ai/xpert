import { CommonModule, formatNumber } from '@angular/common'
import { Component, inject, LOCALE_ID, model, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatDialog } from '@angular/material/dialog'
import { MatIconModule } from '@angular/material/icon'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { DisplayBehaviour, isNil } from '@metad/ocap-core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { TranslationBaseComponent } from 'apps/cloud/src/app/@shared/language'
import { OrgAvatarComponent } from 'apps/cloud/src/app/@shared/organization'
import { UserProfileInlineComponent } from 'apps/cloud/src/app/@shared/user'
import { ICopilotUser } from '../../../../../../../../packages/contracts/src'
import { CopilotUsageService, injectFormatRelative, ToastrService } from '../../../../@core'
import { MatButtonModule } from '@angular/material/button'

@Component({
  standalone: true,
  selector: 'pac-settings-copilot-users',
  templateUrl: './users.component.html',
  styleUrls: ['./users.component.scss'],
  imports: [
    CommonModule,
    RouterModule,
    TranslateModule,
    FormsModule,
    ReactiveFormsModule,
    MatTooltipModule,
    MatIconModule,
    MatButtonModule,
    NgmCommonModule,
    OrgAvatarComponent,
    UserProfileInlineComponent
  ]
})
export class CopilotUsersComponent extends TranslationBaseComponent {
  DisplayBehaviour = DisplayBehaviour

  readonly usageService = inject(CopilotUsageService)
  readonly _toastrService = inject(ToastrService)
  readonly router = inject(Router)
  readonly route = inject(ActivatedRoute)
  readonly dialog = inject(MatDialog)
  readonly translate = inject(TranslateService)
  readonly formatRelative = injectFormatRelative()
  readonly locale = inject(LOCALE_ID)

  readonly usages = signal<ICopilotUser[]>([])

  readonly editId = signal<string | null>(null)
  readonly tokenLimit = model<number>(null)
  readonly priceLimit = model<number>(null)
  readonly loading = signal<boolean>(false)

  private dataSub = this.usageService
    .getUserUsages()
    .pipe(takeUntilDestroyed())
    .subscribe((usages) => {
      this.usages.set(usages)
    })

  _formatNumber(value: number): string {
    return isNil(value) ? '' : formatNumber(value, this.translate.currentLang, '0.0-0')
  }
  formatNumber = this._formatNumber.bind(this)

  _formatPrice(value: number): string {
    return isNil(value) ? '' : formatNumber(value, this.translate.currentLang, '0.0-7')
  }
  formatPrice = this._formatPrice.bind(this)

  renewToken(id: string) {
    this.editId.set(id)
  }

  save(id: string) {
    this.loading.set(true)
    this.usageService.renewUserLimit(id, this.tokenLimit(), this.priceLimit()).subscribe({
      next: (result) => {
        this.usages.update((records) => records.map((item) => (item.id === id ? { ...item, ...result } : item)))
        this.tokenLimit.set(null)
        this.priceLimit.set(null)
        this.editId.set(null)
        this.loading.set(false)
      },
      error: (error) => {
        this.loading.set(false)
        this._toastrService.error(error, 'Error')
      }
    })
  }
}
