import { TestBed } from '@angular/core/testing'
import { DEFAULT_MEMBERSHIP_CNY_PER_POINT, MEMBERSHIP_CNY_PER_POINT_SETTING } from '@xpert-ai/contracts'
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

  it('loads the tenant-wide CNY-per-point setting', async () => {
    const tenantService = TestBed.inject(TenantService) as unknown as {
      getSettings: jest.Mock
    }
    tenantService.getSettings.mockResolvedValue({
      [MEMBERSHIP_CNY_PER_POINT_SETTING]: '0.25'
    })
    const component = TestBed.runInInjectionContext(() => new TenantMembershipComponent())

    await component.ngOnInit()

    expect(component.cnyPerPointCtrl.value).toBe(0.25)
  })

  it('falls back to the default and saves the selected value', async () => {
    const tenantService = TestBed.inject(TenantService) as unknown as {
      getSettings: jest.Mock
      saveSettings: jest.Mock
    }
    tenantService.getSettings.mockResolvedValue({
      [MEMBERSHIP_CNY_PER_POINT_SETTING]: 'invalid'
    })
    tenantService.saveSettings.mockResolvedValue({})
    const component = TestBed.runInInjectionContext(() => new TenantMembershipComponent())

    await component.ngOnInit()
    expect(component.cnyPerPointCtrl.value).toBe(DEFAULT_MEMBERSHIP_CNY_PER_POINT)

    component.cnyPerPointCtrl.setValue(0.2)
    await component.save()

    expect(tenantService.saveSettings).toHaveBeenCalledWith({
      [MEMBERSHIP_CNY_PER_POINT_SETTING]: '0.2'
    })
  })
})
