import { DOCUMENT } from '@angular/common'
import { TestBed } from '@angular/core/testing'
import { ReferralService } from '@cloud/app/@core/state'
import { TranslateService } from '@ngx-translate/core'
import { ZardAlertDialogService } from '@xpert-ai/headless-ui'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { of } from 'rxjs'
import { MembershipService, Store, ToastrService } from '../../../@core'
import { XpAccountComponent } from './account.component'

jest.mock('@cloud/app/@core/state', () => ({
  ReferralService: class ReferralService {}
}))

jest.mock('../../../@core', () => ({
  MembershipService: class MembershipService {},
  Store: class Store {},
  ToastrService: class ToastrService {},
  routeAnimations: []
}))

jest.mock('../../../@shared/pipes', () => ({
  UserPipe: class UserPipe {}
}))

jest.mock('../../../@shared/user', () => ({
  UserAvatarEditorComponent: class UserAvatarEditorComponent {}
}))

describe('XpAccountComponent template', () => {
  it('places larger invitation code actions above the personal information form', () => {
    const template = readFileSync(join(__dirname, 'account.component.html'), 'utf8')
    const copyActionIndex = template.indexOf('data-referral-copy')
    const regenerateActionIndex = template.indexOf('data-referral-regenerate')
    const tabPanelIndex = template.indexOf('<z-tab-nav-panel')
    const routerOutletIndex = template.indexOf('<router-outlet')

    expect(copyActionIndex).toBeGreaterThan(tabPanelIndex)
    expect(routerOutletIndex).toBeGreaterThan(-1)
    expect(copyActionIndex).toBeLessThan(routerOutletIndex)
    expect(regenerateActionIndex).toBeGreaterThan(copyActionIndex)
    expect(template).toContain('rla4.isActive && canUseReferral() && referralCode()')
    expect(template).toContain('@if (canUseMembership())')
    expect(template).not.toContain('@if (hasActiveMembership())')
    expect(template).toMatch(/data-referral-copy[\s\S]*?class="h-auto px-0 py-0 text-base"/)
    expect(template).toMatch(/data-referral-regenerate[\s\S]*?class="h-auto px-0 py-0 text-base"/)
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
            userRolePermissions$: of([]),
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
          provide: ZardAlertDialogService,
          useValue: {
            confirm: jest.fn(() => of(false))
          }
        },
        {
          provide: TranslateService,
          useValue: {
            instant: jest.fn((key: string) => key)
          }
        },
        {
          provide: ToastrService,
          useValue: {
            success: jest.fn(),
            error: jest.fn()
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
    const component = TestBed.runInInjectionContext(() => new XpAccountComponent())
    component.referralCode.set('ABC234DEFG')

    await component.copyReferralCode()

    expect(writeText).toHaveBeenCalledWith('ABC234DEFG')
    expect(component.referralCodeCopied()).toBe(true)
    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 1500)
  })

  it('replaces the invitation code only after destructive confirmation', async () => {
    const regenerateMyCode = jest.fn().mockResolvedValue({ code: 'XYZ234DEFG' })
    const confirm = jest.fn(() => of(true))
    const toastr = {
      success: jest.fn(),
      error: jest.fn()
    }
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Store,
          useValue: {
            user$: of(null),
            userRolePermissions$: of([]),
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
            getMyCode: jest.fn(),
            regenerateMyCode
          }
        },
        {
          provide: ZardAlertDialogService,
          useValue: {
            confirm
          }
        },
        {
          provide: TranslateService,
          useValue: {
            instant: jest.fn((key: string) => key)
          }
        },
        {
          provide: ToastrService,
          useValue: toastr
        },
        {
          provide: DOCUMENT,
          useValue: {
            defaultView: null
          }
        }
      ]
    })
    const component = TestBed.runInInjectionContext(() => new XpAccountComponent())
    component.referralCode.set('ABC234DEFG')

    await component.regenerateReferralCode()

    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ destructive: true }))
    expect(regenerateMyCode).toHaveBeenCalledTimes(1)
    expect(component.referralCode()).toBe('XYZ234DEFG')
    expect(toastr.success).toHaveBeenCalledWith(
      'XP.Referral.RegenerateSuccess',
      expect.objectContaining({ Default: 'Invitation code regenerated.' })
    )
  })

  it('keeps the current code when regeneration confirmation is cancelled', async () => {
    const regenerateMyCode = jest.fn()
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Store,
          useValue: {
            user$: of(null),
            userRolePermissions$: of([]),
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
            getMyCode: jest.fn(),
            regenerateMyCode
          }
        },
        {
          provide: ZardAlertDialogService,
          useValue: {
            confirm: jest.fn(() => of(false))
          }
        },
        {
          provide: TranslateService,
          useValue: {
            instant: jest.fn((key: string) => key)
          }
        },
        {
          provide: ToastrService,
          useValue: {
            success: jest.fn(),
            error: jest.fn()
          }
        },
        {
          provide: DOCUMENT,
          useValue: {
            defaultView: null
          }
        }
      ]
    })
    const component = TestBed.runInInjectionContext(() => new XpAccountComponent())
    component.referralCode.set('ABC234DEFG')

    await component.regenerateReferralCode()

    expect(regenerateMyCode).not.toHaveBeenCalled()
    expect(component.referralCode()).toBe('ABC234DEFG')
  })
})
