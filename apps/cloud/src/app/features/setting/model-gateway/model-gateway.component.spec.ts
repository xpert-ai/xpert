import { FormBuilder } from '@angular/forms'
import { TestBed } from '@angular/core/testing'
import { TranslateService } from '@ngx-translate/core'
import {
  DEFAULT_MODEL_GATEWAY_BODY_RETENTION_DAYS,
  DEFAULT_MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS,
  DEFAULT_MODEL_GATEWAY_REQUESTS_PER_MINUTE
} from '@xpert-ai/contracts'
import { ZardDialogService } from '@xpert-ai/headless-ui'
import { Store } from '@xpert-ai/cloud/state'
import { of } from 'rxjs'
import { ModelGatewayService } from '../../../@core/services/model-gateway.service'
import { ToastrService } from '../../../@core/services/toastr.service'
import { ModelGatewayAdminComponent } from './model-gateway.component'

describe('ModelGatewayAdminComponent', () => {
  const gatewayService = {
    getAdminCalls: jest.fn(),
    getAdminKeys: jest.fn(),
    getSettings: jest.fn(),
    updateSettings: jest.fn()
  }
  const store = {
    selectOrganizationId: jest.fn()
  }
  beforeEach(() => {
    jest.clearAllMocks()
    store.selectOrganizationId.mockReturnValue(of(null))
    gatewayService.getAdminCalls.mockReturnValue(of({ items: [], total: 0 }))
    gatewayService.getAdminKeys.mockReturnValue(of({ items: [], total: 0 }))
    gatewayService.getSettings.mockReturnValue(
      of({
        storeBodies: false,
        bodyRetentionDays: 7,
        requestsPerMinute: DEFAULT_MODEL_GATEWAY_REQUESTS_PER_MINUTE,
        maxConcurrentRequests: DEFAULT_MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS
      })
    )

    TestBed.configureTestingModule({
      providers: [
        FormBuilder,
        { provide: Store, useValue: store },
        { provide: ModelGatewayService, useValue: gatewayService },
        { provide: ZardDialogService, useValue: {} },
        {
          provide: ToastrService,
          useValue: {
            error: jest.fn(),
            success: jest.fn()
          }
        },
        {
          provide: TranslateService,
          useValue: {
            instant: (key: string) => key
          }
        }
      ]
    })
  })

  it('loads invalid request limits with safe defaults', async () => {
    gatewayService.getSettings.mockReturnValue(
      of({
        storeBodies: false,
        bodyRetentionDays: 0,
        requestsPerMinute: Number.NaN,
        maxConcurrentRequests: 0
      })
    )
    const component = TestBed.runInInjectionContext(() => new ModelGatewayAdminComponent())

    await component.load()

    expect(component.bodyRetentionDaysCtrl.value).toBe(DEFAULT_MODEL_GATEWAY_BODY_RETENTION_DAYS)
    expect(component.requestsPerMinuteCtrl.value).toBe(DEFAULT_MODEL_GATEWAY_REQUESTS_PER_MINUTE)
    expect(component.maxConcurrentRequestsCtrl.value).toBe(DEFAULT_MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS)
  })

  it('rejects invalid retention days and fractional request limits', () => {
    const component = TestBed.runInInjectionContext(() => new ModelGatewayAdminComponent())

    component.bodyRetentionDaysCtrl.setValue(0)
    component.requestsPerMinuteCtrl.setValue(1.5)
    component.maxConcurrentRequestsCtrl.setValue(2.5)

    expect(component.bodyRetentionDaysCtrl.hasError('min')).toBe(true)
    expect(component.requestsPerMinuteCtrl.hasError('integer')).toBe(true)
    expect(component.maxConcurrentRequestsCtrl.hasError('integer')).toBe(true)
  })

  it('loads organization calls and keys without requesting tenant settings', async () => {
    store.selectOrganizationId.mockReturnValue(of('org-1'))
    const component = TestBed.runInInjectionContext(() => new ModelGatewayAdminComponent())

    await component.load()

    expect(component.isTenantScope()).toBe(false)
    expect(gatewayService.getAdminCalls).toHaveBeenCalled()
    expect(gatewayService.getAdminKeys).toHaveBeenCalled()
    expect(gatewayService.getSettings).not.toHaveBeenCalled()
  })

  it('saves request limits and body retention together', async () => {
    gatewayService.updateSettings.mockReturnValue(
      of({
        storeBodies: true,
        bodyRetentionDays: 7,
        requestsPerMinute: 120,
        maxConcurrentRequests: 8
      })
    )
    const component = TestBed.runInInjectionContext(() => new ModelGatewayAdminComponent())
    component.settingsForm.controls.storeBodies.setValue(true)
    component.settingsForm.controls.bodyRetentionDays.setValue(30)
    component.requestsPerMinuteCtrl.setValue(120)
    component.maxConcurrentRequestsCtrl.setValue(8)

    await component.saveSettings()

    expect(gatewayService.updateSettings).toHaveBeenCalledWith({
      storeBodies: true,
      bodyRetentionDays: 30,
      requestsPerMinute: 120,
      maxConcurrentRequests: 8
    })
    expect(component.settingsForm.pristine).toBe(true)
  })
})
