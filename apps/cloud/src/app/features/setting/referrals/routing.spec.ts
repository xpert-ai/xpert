jest.mock('../../../@core', () => ({
  FeatureEnum: {
    FEATURE_REFERRAL: 'FEATURE_REFERRAL'
  },
  PermissionsEnum: {
    REFERRAL_VIEW: 'REFERRAL_VIEW'
  }
}))

jest.mock('../../feature-gate', () => ({
  featureGate: jest.fn((featureKeys: string[], redirectCommands: string[]) => ({
    featureKeys,
    redirectCommands
  }))
}))

jest.mock('../../features-routing.module', () => ({
  redirectTo: jest.fn()
}))

jest.mock('./referrals.component', () => ({
  ReferralRelationsComponent: class ReferralRelationsComponent {}
}))

import { NgxPermissionsGuard } from 'ngx-permissions'
import { referralSettingsGate, routes } from './routing'

describe('referral settings routes', () => {
  it('keeps the referral page tenant-only and protected by feature and permission guards', () => {
    expect(routes).toHaveLength(1)
    expect(routes[0].canActivate).toEqual([NgxPermissionsGuard, referralSettingsGate])
    expect(routes[0].data).toEqual(
      expect.objectContaining({
        scopeContext: 'tenant-only',
        permissions: {
          only: ['REFERRAL_VIEW'],
          redirectTo: expect.any(Function)
        }
      })
    )
  })
})
