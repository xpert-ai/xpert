jest.mock('../../@core', () => ({
  AiFeatureEnum: {
    FEATURE_MEMBERSHIP_PLAN: 'FEATURE_MEMBERSHIP_PLAN',
    FEATURE_MODEL_ACCESS_REQUEST: 'FEATURE_MODEL_ACCESS_REQUEST',
    FEATURE_MODEL_GATEWAY: 'FEATURE_MODEL_GATEWAY',
    FEATURE_XPERT: 'FEATURE_XPERT',
    FEATURE_XPERT_MARKETPLACE: 'FEATURE_XPERT_MARKETPLACE'
  },
  AIPermissionsEnum: {
    COPILOT_EDIT: 'COPILOT_EDIT',
    MEMBERSHIP_EDIT: 'MEMBERSHIP_EDIT',
    MODEL_ACCESS_REQUEST_VIEW: 'MODEL_ACCESS_REQUEST_VIEW',
    MODEL_ACCESS_REQUEST_EDIT: 'MODEL_ACCESS_REQUEST_EDIT',
    MODEL_GATEWAY_MANAGE: 'MODEL_GATEWAY_MANAGE'
  },
  PermissionsEnum: {
    ALL_ORG_EDIT: 'ALL_ORG_EDIT',
    ALL_ORG_VIEW: 'ALL_ORG_VIEW',
    CHANGE_ROLES_PERMISSIONS: 'CHANGE_ROLES_PERMISSIONS',
    DATA_SOURCE_EDIT: 'DATA_SOURCE_EDIT',
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
  XpAccountComponent: class XpAccountComponent {}
}))

jest.mock('./account/password.component', () => ({
  XpAccountPasswordComponent: class XpAccountPasswordComponent {}
}))

jest.mock('./account/profile.component', () => ({
  XpAccountProfileComponent: class XpAccountProfileComponent {}
}))

jest.mock('./settings.component', () => ({
  XpSettingComponent: class XpSettingComponent {}
}))

import { NgxPermissionsGuard } from 'ngx-permissions'
import {
  modelAccessAccountGate,
  modelGatewayAccountGate,
  modelGatewaySettingsGate,
  membershipPlanAccountGate,
  membershipPlanSettingsGate,
  routes
} from './setting-routing.module'

describe('setting routes', () => {
  const settingChildren = routes[0].children ?? []
  const accountChildren = settingChildren.find((route) => route.path === 'account')?.children ?? []

  it('guards membership settings with permission and membership plan feature gates', () => {
    const membershipRoute = settingChildren.find((route) => route.path === 'membership')

    expect(membershipRoute?.canActivate).toEqual([NgxPermissionsGuard, membershipPlanSettingsGate])
    expect(membershipRoute?.data?.['permissions']).toEqual({
      only: ['MEMBERSHIP_EDIT'],
      redirectTo: expect.any(Function)
    })
  })

  it('guards account usage and billing tabs with the membership plan feature gate', () => {
    const usageRoute = accountChildren.find((route) => route.path === 'usage')
    const billingRoute = accountChildren.find((route) => route.path === 'billing')

    expect(usageRoute?.canActivate).toEqual([membershipPlanAccountGate])
    expect(billingRoute?.canActivate).toEqual([membershipPlanAccountGate])
  })

  it('keeps available models open to regular users without requiring a membership', () => {
    const modelsRoute = accountChildren.find((route) => route.path === 'models')

    expect(modelsRoute).toBeDefined()
    expect(modelsRoute?.canActivate).toEqual([modelAccessAccountGate])
  })

  it('guards the personal and admin model gateway routes independently', () => {
    const accountApiRoute = accountChildren.find((route) => route.path === 'api')
    const adminRoute = settingChildren.find((route) => route.path === 'model-gateway')

    expect(accountApiRoute?.canActivate).toEqual([modelGatewayAccountGate])
    expect(accountApiRoute?.data?.['scopeContext']).toBe('dual-scope')
    expect(adminRoute?.canActivate).toEqual([NgxPermissionsGuard, modelGatewaySettingsGate])
    expect(adminRoute?.data?.['scopeContext']).toBe('dual-scope')
    expect(adminRoute?.data?.['permissions']).toEqual({
      only: ['MODEL_GATEWAY_MANAGE'],
      redirectTo: expect.any(Function)
    })
  })
})
