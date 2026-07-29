import { DOCUMENT } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { ReferralService } from '@cloud/app/@core/state'
import { AiFeatureEnum, AIPermissionsEnum, FeatureEnum, UserType } from '@xpert-ai/contracts'
import { ZardButtonComponent, ZardDividerComponent, ZardTabsImports } from '@xpert-ai/headless-ui'
import { RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { MembershipService, Store, routeAnimations } from '../../../@core'
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
  private readonly membership = inject(MembershipService)
  private readonly referralService = inject(ReferralService)
  private readonly document = inject(DOCUMENT)
  private referralCodeRequested = false

  public readonly user = toSignal(this.store.user$)
  public readonly featureContextHydrated = toSignal(this.store.featureContextHydrated$, {
    initialValue: this.store.featureContextHydrated
  })
  public readonly isTechnicalUser = computed(() => this.user()?.type === UserType.COMMUNICATION)
  public readonly hasActiveMembership = toSignal(this.membership.hasActiveMembershipInScope(), { initialValue: false })
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

  private async loadReferralCode() {
    try {
      const result = await this.referralService.getMyCode()
      this.referralCode.set(result.code)
    } catch {
      this.referralCode.set('')
    }
  }
}
