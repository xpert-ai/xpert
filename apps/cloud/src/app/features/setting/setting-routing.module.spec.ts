jest.mock('../../@core', () => ({
  AiFeatureEnum: {
    FEATURE_MEMBERSHIP_PLAN: 'FEATURE_MEMBERSHIP_PLAN',
    FEATURE_XPERT: 'FEATURE_XPERT',
    FEATURE_XPERT_MARKETPLACE: 'FEATURE_XPERT_MARKETPLACE'
  },
  AIPermissionsEnum: {
    MEMBERSHIP_EDIT: 'MEMBERSHIP_EDIT'
  },
  AnalyticsPermissionsEnum: {
    BUSINESS_AREA_EDIT: 'BUSINESS_AREA_EDIT',
    DATA_SOURCE_EDIT: 'DATA_SOURCE_EDIT'
  },
  PermissionsEnum: {
    ALL_ORG_EDIT: 'ALL_ORG_EDIT',
    ALL_ORG_VIEW: 'ALL_ORG_VIEW',
    CHANGE_ROLES_PERMISSIONS: 'CHANGE_ROLES_PERMISSIONS',
    INTEGRATION_EDIT: 'INTEGRATION_EDIT',
    ORG_USERS_EDIT: 'ORG_USERS_EDIT',
    ORG_USERS_VIEW: 'ORG_USERS_VIEW'
  },
  RolesEnum: {
    SUPER_ADMIN: 'SUPER_ADMIN'
  }
}))

jest.mock('../feature-gate', () => ({
  featureGate: jest.fn((featureKeys: string[], redirectCommands: string[]) => ({
    featureKeys,
    redirectCommands
  }))
}))

jest.mock('./account/account.component', () => ({
  PACAccountComponent: class PACAccountComponent {}
}))

jest.mock('./account/password.component', () => ({
  PACAccountPasswordComponent: class PACAccountPasswordComponent {}
}))

jest.mock('./account/profile.component', () => ({
  PACAccountProfileComponent: class PACAccountProfileComponent {}
}))

jest.mock('./settings.component', () => ({
  PACSettingComponent: class PACSettingComponent {}
}))

import { NgxPermissionsGuard } from 'ngx-permissions'
import { membershipPlanAccountGate, membershipPlanSettingsGate, routes } from './setting-routing.module'

describe('setting routes', () => {
  const settingChildren = routes[0].children ?? []
  const accountChildren = settingChildren.find((route) => route.path === 'account')?.children ?? []

  it('guards membership settings with permission and membership plan feature gates', () => {
    const membershipRoute = settingChildren.find((route) => route.path === 'membership')

    expect(membershipRoute?.canActivate).toEqual([NgxPermissionsGuard, membershipPlanSettingsGate])
  })

  it('guards account usage and billing tabs with the membership plan feature gate', () => {
    const usageRoute = accountChildren.find((route) => route.path === 'usage')
    const billingRoute = accountChildren.find((route) => route.path === 'billing')

    expect(usageRoute?.canActivate).toEqual([membershipPlanAccountGate])
    expect(billingRoute?.canActivate).toEqual([membershipPlanAccountGate])
  })
})
