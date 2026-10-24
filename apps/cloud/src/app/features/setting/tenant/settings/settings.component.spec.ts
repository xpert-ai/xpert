import { ChangeDetectorRef } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { DataSourceTypesService } from '@cloud/app/@core/state'
import {
  COPILOT_CHECKPOINT_RETENTION_DAYS_SETTING,
  COPILOT_CHECKPOINT_RETENTION_ENABLED_SETTING,
  MODEL_GATEWAY_CALL_RETENTION_DAYS_SETTING,
  MODEL_GATEWAY_CALL_RETENTION_ENABLED_SETTING
} from '@xpert-ai/contracts'
import { TenantService, ToastrService } from '../../../../@core'
import { SettingsComponent } from './settings.component'

jest.mock('@cloud/app/@core/state', () => ({ DataSourceTypesService: class DataSourceTypesService {} }))
jest.mock('../../../../@core', () => ({
  TenantService: class TenantService {},
  ToastrService: class ToastrService {},
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error))
}))

describe('tenant general settings', () => {
  const retentionNames = [
    COPILOT_CHECKPOINT_RETENTION_ENABLED_SETTING,
    COPILOT_CHECKPOINT_RETENTION_DAYS_SETTING,
    MODEL_GATEWAY_CALL_RETENTION_ENABLED_SETTING,
    MODEL_GATEWAY_CALL_RETENTION_DAYS_SETTING
  ]
  const tenantService = { getSettings: jest.fn(), saveSettings: jest.fn() }
  const toastr = { error: jest.fn() }
  let component: SettingsComponent

  beforeEach(() => {
    jest.resetAllMocks()
    TestBed.configureTestingModule({
      providers: [
        { provide: TenantService, useValue: tenantService },
        { provide: ToastrService, useValue: toastr },
        { provide: DataSourceTypesService, useValue: {} },
        { provide: ChangeDetectorRef, useValue: { detectChanges: jest.fn(), markForCheck: jest.fn() } }
      ]
    })
    component = TestBed.runInInjectionContext(
      () => new SettingsComponent(TestBed.inject(TenantService), TestBed.inject(ChangeDetectorRef))
    )
  })

  it('excludes all dedicated retention parameters while retaining ordinary tenant settings', async () => {
    tenantService.getSettings.mockResolvedValue({
      ...Object.fromEntries(retentionNames.map((name) => [name, '60'])),
      tenant_title: 'My tenant',
      removed: null
    })

    await component.ngOnInit()

    expect(component.listOfData).toEqual([{ id: '1', name: 'tenant_title', value: 'My tenant' }])
  })

  it.each(retentionNames)('blocks manually adding the dedicated parameter %s', async (name) => {
    component.addNew()
    const row = component.listOfData[0]
    component.editCache[row.id].data = { ...row, name, value: '10' }

    await component.saveEdit(row.id)

    expect(tenantService.saveSettings).not.toHaveBeenCalled()
    expect(row.name).toBe('')
    expect(component.editCache[row.id].edit).toBe(true)
    expect(toastr.error).toHaveBeenCalledWith(
      'XP.MENU.TENANT.RETENTION_MANAGED_SETTING',
      undefined,
      expect.objectContaining({ Default: expect.any(String) })
    )
  })

  it('blocks renaming an ordinary parameter into a dedicated retention parameter', async () => {
    component.add({ name: 'tenant_title', value: 'Original' })
    const row = component.listOfData[0]
    component.startEdit(row.id)
    component.editCache[row.id].data.name = COPILOT_CHECKPOINT_RETENTION_DAYS_SETTING

    await component.saveEdit(row.id)

    expect(tenantService.saveSettings).not.toHaveBeenCalled()
    expect(row.name).toBe('tenant_title')
    expect(component.editCache[row.id].edit).toBe(true)
  })

  it('preserves the original displayed value and editable draft when a save is rejected', async () => {
    component.add({ name: 'tenant_title', value: 'Original' })
    const row = component.listOfData[0]
    component.startEdit(row.id)
    component.editCache[row.id].data.value = 'Changed'
    tenantService.saveSettings.mockRejectedValue(new Error('Forbidden'))

    await component.saveEdit(row.id)

    expect(row.value).toBe('Original')
    expect(component.editCache[row.id]).toMatchObject({ edit: true, data: { value: 'Changed' } })
    expect(toastr.error).toHaveBeenCalledWith('Forbidden')
  })

  it('updates the displayed value and exits editing only after the save succeeds', async () => {
    component.add({ name: 'tenant_title', value: 'Original' })
    const row = component.listOfData[0]
    component.startEdit(row.id)
    component.editCache[row.id].data.value = 'Changed'
    let finishSave: () => void
    tenantService.saveSettings.mockReturnValue(new Promise<void>((resolve) => (finishSave = resolve)))

    const saving = component.saveEdit(row.id)
    expect(row.value).toBe('Original')
    expect(component.editCache[row.id].edit).toBe(true)
    finishSave()
    await saving

    expect(tenantService.saveSettings).toHaveBeenCalledWith({ tenant_title: 'Changed' })
    expect(row.value).toBe('Changed')
    expect(component.editCache[row.id].edit).toBe(false)
    expect(toastr.error).not.toHaveBeenCalled()
  })

  it('updates the saved row even when another row is removed during the request', async () => {
    component.add({ name: 'tenant_title_en', value: 'First' })
    component.add({ name: 'tenant_title', value: 'Original' })
    const row = component.listOfData[1]
    component.startEdit(row.id)
    component.editCache[row.id].data.value = 'Changed'
    let finishSave: () => void
    tenantService.saveSettings
      .mockReturnValueOnce(new Promise<void>((resolve) => (finishSave = resolve)))
      .mockResolvedValueOnce({})

    const saving = component.saveEdit(row.id)
    await component.deleteRow(component.listOfData[0].id)
    finishSave()
    await saving

    expect(component.listOfData).toEqual([{ id: row.id, name: 'tenant_title', value: 'Changed' }])
    expect(toastr.error).not.toHaveBeenCalled()
  })

  it.each(['{"enabled":true,}', '', '{"enabled":'])(
    'blocks invalid JSON %p without changing the persisted value',
    async (invalid) => {
      const original = '{"enabled":true}'
      component.add({ name: 'policy', value: original })
      component.startEdit('1')
      const control = component.editCache['1'].jsonControl
      expect(control.value).toBe(JSON.stringify(JSON.parse(original), null, 2))
      control.setValue(invalid)

      await component.saveEdit('1')

      expect(control.hasError('jsonSyntax')).toBe(true)
      expect(tenantService.saveSettings).not.toHaveBeenCalled()
      expect(component.listOfData[0].value).toBe(original)
      expect(component.editCache['1'].edit).toBe(true)
    }
  )

  it('saves corrected JSON as a string and retains the draft after a failed request', async () => {
    component.add({ name: 'policy', value: '[]' })
    component.startEdit('1')
    const control = component.editCache['1'].jsonControl
    control.setValue('[false, 0, {"enabled": true}]')
    tenantService.saveSettings.mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce({})

    await component.saveEdit('1')
    expect(component.editCache['1'].jsonControl).toBe(control)
    expect(component.listOfData[0].value).toBe('[]')
    await component.saveEdit('1')

    expect(tenantService.saveSettings).toHaveBeenLastCalledWith({ policy: '[false, 0, {"enabled": true}]' })
    expect(component.listOfData[0].value).toBe(control.value)
    expect(component.editCache['1'].edit).toBe(false)
  })

  it('preserves a JSON draft when adding another row and discards it on cancel', () => {
    component.add({ name: 'policy', value: '{}' })
    component.startEdit('1')
    component.editCache['1'].jsonControl.setValue('{unfinished')
    component.addNew()
    expect(component.editCache['1'].jsonControl.value).toBe('{unfinished')
    component.cancelEdit('1')
    component.startEdit('1')
    expect(component.editCache['1'].jsonControl.value).toBe('{}')
    expect(tenantService.saveSettings).not.toHaveBeenCalled()
  })

  it('keeps ordinary text in text mode and allows opting into validated JSON editing', () => {
    component.add({ name: 'fileStorageProvider', value: 'LOCAL' })
    component.startEdit('1')
    expect(component.editCache['1'].jsonControl).toBeUndefined()
    component.editAsJson('1')
    expect(component.editCache['1'].jsonControl.invalid).toBe(true)
    expect(component.editCache['1'].jsonControl.value).toBe('LOCAL')
  })
})
