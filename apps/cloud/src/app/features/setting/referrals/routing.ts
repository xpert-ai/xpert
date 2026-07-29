import { Routes } from '@angular/router'
import { NgxPermissionsGuard } from 'ngx-permissions'
import { FeatureEnum, PermissionsEnum } from '../../../@core'
import { featureGate } from '../../feature-gate'
import { redirectTo } from '../../features-routing.module'
import { ReferralRelationsComponent } from './referrals.component'

export const referralSettingsGate = featureGate([FeatureEnum.FEATURE_REFERRAL], ['/settings'])

export const routes: Routes = [
  {
    path: '',
    component: ReferralRelationsComponent,
    canActivate: [NgxPermissionsGuard, referralSettingsGate],
    data: {
      title: 'settings/referrals',
      scopeContext: 'tenant-only',
      permissions: {
        only: [PermissionsEnum.REFERRAL_VIEW],
        redirectTo
      }
    }
  }
]
