import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { AiFeatureEnum, AIPermissionsEnum, UserType } from '@xpert-ai/contracts'
import { ZardDividerComponent, ZardTabsImports } from '@xpert-ai/headless-ui'
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
}
