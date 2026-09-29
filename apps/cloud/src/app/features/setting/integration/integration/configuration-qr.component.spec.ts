import { Dialog } from '@angular/cdk/dialog'
import { ViewContainerRef } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { ActivatedRoute, Router } from '@angular/router'
import { of, Subject } from 'rxjs'
import { IntegrationService, Store, ToastrService } from '../../../../@core'
import { IntegrationConfigurationComponent } from './configuration.component'
import { TIntegrationQrCompletion } from '@xpert-ai/contracts'

jest.mock('echarts/core', () => ({ registerTheme: jest.fn() }))
jest.mock('ngxtension/inject-params', () => ({ injectParams: () => jest.requireActual('@angular/core').signal(null) }))
jest.mock('ngxtension/inject-query-params', () => ({
  injectQueryParams: () => jest.requireActual('@angular/core').signal(null)
}))

describe('Integration configuration QR entry', () => {
  function setup() {
    const closed = new Subject<TIntegrationQrCompletion>()
    const ref = { close: jest.fn(), closed }
    const dialog = { open: jest.fn(() => ref) }
    const router = { navigate: jest.fn() }
    const toastr = { success: jest.fn() }
    const store = { organizationId: 'org', userId: 'user', selectOrganizationId: () => of('org') }
    const api = {
      getProviders: () =>
        of([
          { name: 'qr-provider', label: { en_US: 'QR' }, setup: { qrAuthorization: true } },
          { name: 'manual-provider', label: { en_US: 'Manual' } }
        ])
    }
    TestBed.configureTestingModule({
      providers: [
        { provide: IntegrationService, useValue: api },
        { provide: Store, useValue: store },
        { provide: ToastrService, useValue: toastr },
        { provide: Dialog, useValue: dialog },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: {} },
        { provide: ViewContainerRef, useValue: {} }
      ]
    })
    const component = TestBed.runInInjectionContext(() => new IntegrationConfigurationComponent())
    component.formGroup.patchValue({ name: 'Robot', provider: 'qr-provider', description: 'Team robot' })
    return { component, dialog, closed, router, toastr, store }
  }

  afterEach(() => TestBed.resetTestingModule())

  it('uses the provider capability and keeps manual configuration available', () => {
    const { component } = setup()
    expect(component.canScan()).toBe(true)
    expect(component.scanMode()).toBe(true)
    component.setupMode.set('manual')
    expect(component.scanMode()).toBe(false)
    component.formGroup.controls.provider.setValue('manual-provider')
    expect(component.canScan()).toBe(false)
  })

  it('opens a single QR dialog with metadata and navigates after successful creation', () => {
    const { component, dialog, closed, router, toastr } = setup()
    component.formGroup.markAsDirty()
    component.createByQr()
    component.createByQr()
    expect(dialog.open).toHaveBeenCalledTimes(1)
    expect(dialog.open.mock.calls[0][1].data.input).toMatchObject({ name: 'Robot', description: 'Team robot' })
    closed.next({ id: 'created', name: 'Robot', provider: 'qr-provider', slug: 'robot', outcome: 'created' })
    expect(component.isDirty()).toBe(false)
    expect(router.navigate).toHaveBeenCalledWith(['/settings/integration', 'created'])
    expect(toastr.success).toHaveBeenCalledWith('XP.Integration.Qr.Created')
  })

  it('identifies reuse and opens the existing integration', () => {
    const { component, closed, router, toastr } = setup()
    component.createByQr()
    closed.next({ id: 'existing', name: 'Old name', provider: 'qr-provider', slug: 'robot', outcome: 'reused' })
    expect(router.navigate).toHaveBeenCalledWith(['/settings/integration', 'existing'])
    expect(toastr.success).toHaveBeenCalledWith('XP.Integration.Qr.Reused')
  })

  it('does not open a QR session without a name or organization', () => {
    const { component, dialog, store } = setup()
    component.formGroup.controls.name.setValue('  ')
    component.createByQr()
    component.formGroup.controls.name.setValue('Robot')
    store.organizationId = ''
    component.createByQr()
    expect(dialog.open).not.toHaveBeenCalled()
  })
})
