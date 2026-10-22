import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { ManualRetentionPreview } from '@xpert-ai/contracts'
import { TenantService, ToastrService } from '../../../../@core'
import { ManualCleanupComponent } from './manual-cleanup.component'

jest.mock('../../../../@core', () => ({
  TenantService: class TenantService {},
  ToastrService: class ToastrService {},
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error))
}))

describe('ManualCleanupComponent', () => {
  const preview: ManualRetentionPreview = {
    target: 'copilot_checkpoint',
    start: '2020-01-01T00:00:00Z',
    end: '2020-02-01T00:00:00Z',
    previewToken: 'receipt',
    expiresAt: '2099-01-01T00:00:00Z',
    scope: 'all_tenants',
    matchedCount: 8,
    protectedCount: 3,
    eligibleCount: 5,
    selectedCount: 5,
    relatedWriteCount: 10,
    batchLimit: 1000
  }
  const tenant = { previewCleanup: jest.fn(), executeCleanup: jest.fn() }
  const toastr = { error: jest.fn() }
  beforeEach(async () => {
    jest.clearAllMocks()
    tenant.previewCleanup.mockResolvedValue(preview)
    tenant.executeCleanup.mockResolvedValue({ deletedCount: 4, deletedWriteCount: 8, skippedCount: 1 })
    await TestBed.configureTestingModule({
      imports: [ManualCleanupComponent, TranslateModule.forRoot()],
      providers: [
        { provide: TenantService, useValue: tenant },
        { provide: ToastrService, useValue: toastr }
      ]
    }).compileComponents()
  })
  function fixture() {
    const fixture = TestBed.createComponent(ManualCleanupComponent)
    fixture.detectChanges()
    fixture.componentInstance.form.patchValue({ start: '2020-01-01T00:00', end: '2020-02-01T00:00' })
    return fixture
  }
  it('renders a preview, requires confirmation and shows actual results', async () => {
    const view = fixture()
    const component = view.componentInstance
    await component.executeCleanup()
    expect(tenant.executeCleanup).not.toHaveBeenCalled()
    await component.previewCleanup()
    view.detectChanges()
    expect(view.nativeElement.querySelectorAll('dd').length).toBe(4)
    expect(view.nativeElement.querySelector('button[zType="destructive"]').disabled).toBe(true)
    await component.executeCleanup()
    expect(tenant.executeCleanup).not.toHaveBeenCalled()
    component.confirmed.setValue(true)
    await component.executeCleanup()
    view.detectChanges()
    expect(tenant.executeCleanup).toHaveBeenCalledWith('receipt')
    expect(component.preview()).toBeNull()
    expect(view.nativeElement.querySelector('[role="status"]')).toBeTruthy()
  })
  it('invalidates a preview and confirmation when filters change', async () => {
    const view = fixture()
    await view.componentInstance.previewCleanup()
    view.componentInstance.confirmed.setValue(true)
    view.componentInstance.form.controls.target.setValue('model_gateway_call')
    expect(view.componentInstance.preview()).toBeNull()
    expect(view.componentInstance.confirmed.value).toBe(false)
    await view.componentInstance.executeCleanup()
    expect(tenant.executeCleanup).not.toHaveBeenCalled()
  })
  it('rejects invalid, reversed and future ranges and sends local times as ISO timestamps', async () => {
    const component = fixture().componentInstance
    component.form.controls.end.setValue('2019-01-01T00:00')
    await component.previewCleanup()
    component.form.controls.end.setValue('2099-01-01T00:00')
    await component.previewCleanup()
    expect(tenant.previewCleanup).not.toHaveBeenCalled()
    component.form.controls.end.setValue('2020-02-01T00:00')
    await component.previewCleanup()
    expect(tenant.previewCleanup).toHaveBeenCalledWith({
      target: 'copilot_checkpoint',
      start: new Date('2020-01-01T00:00').toISOString(),
      end: new Date('2020-02-01T00:00').toISOString()
    })
  })
  it('discards stale responses and prevents duplicate submissions', async () => {
    let finish: (value: ManualRetentionPreview) => void = () => {}
    tenant.previewCleanup.mockReturnValue(
      new Promise<ManualRetentionPreview>((resolve) => {
        finish = resolve
      })
    )
    const component = fixture().componentInstance
    const pending = component.previewCleanup()
    await component.previewCleanup()
    expect(tenant.previewCleanup).toHaveBeenCalledTimes(1)
    component.form.controls.target.setValue('model_gateway_call')
    finish(preview)
    await pending
    expect(component.preview()).toBeNull()
  })
  it('requires a fresh preview after an execution error', async () => {
    tenant.executeCleanup.mockRejectedValueOnce(new Error('Expired preview'))
    const component = fixture().componentInstance
    await component.previewCleanup()
    component.confirmed.setValue(true)
    await component.executeCleanup()
    expect(component.preview()).toBeNull()
    expect(toastr.error).toHaveBeenCalledWith('Expired preview')
  })
})
