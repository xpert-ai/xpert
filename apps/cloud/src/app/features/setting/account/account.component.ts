import { DOCUMENT } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { ReferralService } from '@cloud/app/@core/state'
import { AiFeatureEnum, AIPermissionsEnum, FeatureEnum, UserType } from '@xpert-ai/contracts'
import {
  ZardAlertDialogService,
  ZardButtonComponent,
  ZardDividerComponent,
  ZardTabsImports
} from '@xpert-ai/headless-ui'
import { RouterModule } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { firstValueFrom, map } from 'rxjs'
import { Store, ToastrService, routeAnimations } from '../../../@core'
import { UserPipe } from '../../../@shared/pipes'
import { UserAvatarEditorComponent } from '../../../@shared/user'

@Component({
  standalone: true,
  selector: 'xp-account',
  templateUrl: './account.component.html',
  styleUrls: ['./account.component.scss'],
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ...ZardTabsImports,
    ZardButtonComponent,
    ZardDividerComponent,
    TranslateModule,
    RouterModule,
    UserPipe,
    UserAvatarEditorComponent
  ]
})
export class XpAccountComponent {
  private readonly store = inject(Store)
  private readonly referralService = inject(ReferralService)
  private readonly document = inject(DOCUMENT)
  private readonly alertDialog = inject(ZardAlertDialogService)
  private readonly translate = inject(TranslateService)
  private readonly toastr = inject(ToastrService)
  private referralCodeRequested = false

  public readonly user = toSignal(this.store.user$)
  public readonly featureContextHydrated = toSignal(this.store.featureContextHydrated$, {
    initialValue: this.store.featureContextHydrated
  })
  public readonly isTechnicalUser = computed(() => this.user()?.type === UserType.COMMUNICATION)
  public readonly canUseMembership = toSignal(
    this.store.userRolePermissions$.pipe(
      map((permissions) =>
        permissions.some(
          (permission) => permission.enabled && permission.permission === AIPermissionsEnum.MEMBERSHIP_USE
        )
      )
    ),
    { initialValue: this.store.hasPermission(AIPermissionsEnum.MEMBERSHIP_USE) }
  )
  public readonly canUseModelGateway = computed(() => {
    this.user()
    this.featureContextHydrated()
    return (
      !this.isTechnicalUser() &&
      this.store.hasFeatureEnabled(AiFeatureEnum.FEATURE_MODEL_GATEWAY) &&
      this.store.hasPermission(AIPermissionsEnum.MODEL_GATEWAY_USE)
    )
  })
  public readonly canUseReferral = computed(() => {
    this.user()
    this.featureContextHydrated()
    return !this.isTechnicalUser() && this.store.hasFeatureEnabled(FeatureEnum.FEATURE_REFERRAL)
  })
  public readonly referralCode = signal('')
  public readonly referralCodeCopied = signal(false)
  public readonly referralCodeRegenerating = signal(false)

  constructor() {
    effect(() => {
      if (this.canUseReferral() && !this.referralCodeRequested) {
        this.referralCodeRequested = true
        void this.loadReferralCode()
      }
    })
  }

  async copyReferralCode() {
    const code = this.referralCode()
    const clipboard = this.document.defaultView?.navigator.clipboard
    if (!code || !clipboard) {
      return
    }

    try {
      await clipboard.writeText(code)
      this.referralCodeCopied.set(true)
      this.document.defaultView?.setTimeout(() => this.referralCodeCopied.set(false), 1500)
    } catch {
      this.referralCodeCopied.set(false)
    }
  }

  async regenerateReferralCode() {
    if (!this.referralCode() || this.referralCodeRegenerating()) {
      return
    }

    const confirmed = await firstValueFrom(
      this.alertDialog.confirm({
        title: this.translate.instant('XP.Referral.RegenerateConfirmTitle', {
          Default: 'Regenerate invitation code?'
        }),
        description: this.translate.instant('XP.Referral.RegenerateConfirmDescription', {
          Default:
            'The current invitation code will stop working immediately. Existing invitation relationships will not be changed.'
        }),
        actionText: this.translate.instant('XP.Referral.RegenerateCode', {
          Default: 'Regenerate invitation code'
        }),
        cancelText: this.translate.instant('XP.ACTIONS.Cancel', { Default: 'Cancel' }),
        destructive: true
      })
    )
    if (!confirmed) {
      return
    }

    this.referralCodeRegenerating.set(true)
    try {
      const result = await this.referralService.regenerateMyCode()
      this.referralCode.set(result.code)
      this.referralCodeCopied.set(false)
      this.toastr.success('XP.Referral.RegenerateSuccess', {
        Default: 'Invitation code regenerated.'
      })
    } catch {
      this.toastr.error('XP.Referral.RegenerateFailed', 'XP.TOASTR.TITLE.ERROR', {
        Default: 'Invitation code could not be regenerated.'
      })
    } finally {
      this.referralCodeRegenerating.set(false)
    }
  }

  private async loadReferralCode() {
    try {
      const result = await this.referralService.getMyCode()
      this.referralCode.set(result.code)
    } catch {
      this.referralCode.set('')
    }
  }
}
