import { TestBed } from '@angular/core/testing'
import {
  COPILOT_CHECKPOINT_RETENTION_DAYS_SETTING,
  COPILOT_CHECKPOINT_RETENTION_ENABLED_SETTING
} from '@xpert-ai/contracts'
import { TenantService, ToastrService } from '../../../../@core'
import { TenantRetentionComponent } from './retention.component'

jest.mock('../../../../@core', () => ({
  TenantService: class TenantService {},
  ToastrService: class ToastrService {},
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error))
}))

describe('TenantRetentionComponent', () => {
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

  it('rejects fractional checkpoint retention days', () => {
    const component = TestBed.runInInjectionContext(() => new TenantRetentionComponent())

    component.retentionDaysCtrl.setValue(1.5)

    expect(component.retentionDaysCtrl.hasError('integer')).toBe(true)
    expect(component.form.invalid).toBe(true)
  })

  it('saves checkpoint retention enablement with retention days', async () => {
    const tenantService = TestBed.inject(TenantService) as unknown as {
      getSettings: jest.Mock
      saveSettings: jest.Mock
    }
    tenantService.saveSettings.mockResolvedValue({})
    const component = TestBed.runInInjectionContext(() => new TenantRetentionComponent())

    component.enabledCtrl.setValue(true)
    component.retentionDaysCtrl.setValue(30)
    await component.save()

    expect(tenantService.saveSettings).toHaveBeenCalledWith({
      [COPILOT_CHECKPOINT_RETENTION_ENABLED_SETTING]: 'true',
      [COPILOT_CHECKPOINT_RETENTION_DAYS_SETTING]: '30'
    })
  })
})
