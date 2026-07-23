import { TestBed } from '@angular/core/testing'
import { DEFAULT_MEMBERSHIP_TOKENS_PER_POINT, MEMBERSHIP_TOKENS_PER_POINT_SETTING } from '@xpert-ai/contracts'
import { TenantService, ToastrService } from '../../../../@core'
import { TenantMembershipComponent } from './membership.component'

jest.mock('../../../../@core', () => ({
  TenantService: class TenantService {},
  ToastrService: class ToastrService {},
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error))
}))

describe('TenantMembershipComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: TenantService,
          useValue: {
            getSettings: jest.fn(),
            saveSettings: jest.fn()
          }
        },
        {
          provide: ToastrService,
          useValue: {
            error: jest.fn(),
            success: jest.fn()
          }
        }
      ]
    })
  })

  it('loads the tenant-wide tokens-per-point setting', async () => {
    const tenantService = TestBed.inject(TenantService) as unknown as {
      getSettings: jest.Mock
    }
    tenantService.getSettings.mockResolvedValue({
      [MEMBERSHIP_TOKENS_PER_POINT_SETTING]: '100000'
    })
    const component = TestBed.runInInjectionContext(() => new TenantMembershipComponent())

    await component.ngOnInit()

    expect(component.tokensPerPointCtrl.value).toBe(100000)
  })

  it('falls back to the default and saves the selected value', async () => {
    const tenantService = TestBed.inject(TenantService) as unknown as {
      getSettings: jest.Mock
      saveSettings: jest.Mock
    }
    tenantService.getSettings.mockResolvedValue({
      [MEMBERSHIP_TOKENS_PER_POINT_SETTING]: 'invalid'
    })
    tenantService.saveSettings.mockResolvedValue({})
    const component = TestBed.runInInjectionContext(() => new TenantMembershipComponent())

    await component.ngOnInit()
    expect(component.tokensPerPointCtrl.value).toBe(DEFAULT_MEMBERSHIP_TOKENS_PER_POINT)

    component.tokensPerPointCtrl.setValue(10000)
    await component.save()

    expect(tenantService.saveSettings).toHaveBeenCalledWith({
      [MEMBERSHIP_TOKENS_PER_POINT_SETTING]: '10000'
    })
  })
})
