import { DOCUMENT } from '@angular/common'
import { TestBed } from '@angular/core/testing'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ReferralService } from '@xpert-ai/cloud/state'
import { of } from 'rxjs'
import { MembershipService, Store } from '../../../@core'
import { PACAccountComponent } from './account.component'

jest.mock('@xpert-ai/cloud/state', () => ({
  ReferralService: class ReferralService {}
}))

jest.mock('../../../@core', () => ({
  MembershipService: class MembershipService {},
  Store: class Store {},
  routeAnimations: []
}))

jest.mock('../../../@shared/pipes', () => ({
  UserPipe: class UserPipe {}
}))

jest.mock('../../../@shared/user', () => ({
  UserAvatarEditorComponent: class UserAvatarEditorComponent {}
}))

describe('PACAccountComponent template', () => {
  it('places the invitation code copy action below the email without a configuration tab', () => {
    const template = readFileSync(join(__dirname, 'account.component.html'), 'utf8')
    const emailIndex = template.indexOf('{{ user()?.email }}')
    const copyActionIndex = template.indexOf('data-referral-copy')
    const tabNavigationIndex = template.indexOf('<nav')

    expect(emailIndex).toBeGreaterThan(-1)
    expect(copyActionIndex).toBeGreaterThan(emailIndex)
    expect(copyActionIndex).toBeLessThan(tabNavigationIndex)
    expect(template).not.toContain("['configuration']")
  })

  it('copies the loaded invitation code', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined)
    const setTimeout = jest.fn()
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Store,
          useValue: {
            user$: of(null),
            featureContextHydrated$: of(true),
            featureContextHydrated: true,
            hasFeatureEnabled: jest.fn(() => false),
            hasPermission: jest.fn(() => false)
          }
        },
        {
          provide: MembershipService,
          useValue: {
            hasActiveMembershipInScope: jest.fn(() => of(false))
          }
        },
        {
          provide: ReferralService,
          useValue: {
            getMyCode: jest.fn()
          }
        },
        {
          provide: DOCUMENT,
          useValue: {
            defaultView: {
              navigator: {
                clipboard: {
                  writeText
                }
              },
              setTimeout
            }
          }
        }
      ]
    })
    const component = TestBed.runInInjectionContext(() => new PACAccountComponent())
    component.referralCode.set('ABC234DEFG')

    await component.copyReferralCode()

    expect(writeText).toHaveBeenCalledWith('ABC234DEFG')
    expect(component.referralCodeCopied()).toBe(true)
    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 1500)
  })
})
