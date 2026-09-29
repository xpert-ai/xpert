import { Dialog } from '@angular/cdk/dialog'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { NoopAnimationsModule } from '@angular/platform-browser/animations'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { IXpertWorkspace, TXpertWorkspaceVisibility } from '@xpert-ai/contracts'
import { ToastrService, XpertWorkspaceService } from 'apps/cloud/src/app/@core'
import { of, throwError } from 'rxjs'
import { XpertWorkspaceSettingsGeneralComponent } from './general.component'

describe('XpertWorkspaceSettingsGeneralComponent', () => {
  let fixture: ComponentFixture<XpertWorkspaceSettingsGeneralComponent>
  const workspaceService = {
    canManage: jest.fn((workspace?: IXpertWorkspace) => workspace?.capabilities?.canManage ?? false),
    update: jest.fn(),
    updateVisibility: jest.fn(),
    refresh: jest.fn()
  }
  const toastr = { success: jest.fn(), error: jest.fn() }

  function workspace(visibility: TXpertWorkspaceVisibility, organizationId = 'org-1'): IXpertWorkspace {
    return {
      id: 'workspace-1',
      name: 'Workspace',
      ownerId: 'owner-1',
      status: 'active',
      organizationId,
      settings: { access: { visibility } },
      capabilities: { canRead: true, canWrite: true, canRun: true, canManage: true }
    }
  }

  async function render(value: IXpertWorkspace) {
    fixture.componentRef.setInput('workspace', value)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
  }

  function sharingSwitch(): HTMLInputElement {
    return fixture.debugElement.nativeElement.querySelector('input[role="switch"]')
  }

  beforeEach(async () => {
    jest.clearAllMocks()
    await TestBed.configureTestingModule({
      imports: [XpertWorkspaceSettingsGeneralComponent, TranslateModule.forRoot(), NoopAnimationsModule],
      providers: [
        { provide: XpertWorkspaceService, useValue: workspaceService },
        { provide: ToastrService, useValue: toastr },
        { provide: Dialog, useValue: { open: jest.fn() } }
      ]
    }).compileComponents()
    TestBed.inject(TranslateService).setTranslation('en', {
      XP: { Xpert: { OrganizationShared: 'Organization shared', TenantShared: 'Tenant shared' } }
    })
    TestBed.inject(TranslateService).use('en')
    fixture = TestBed.createComponent(XpertWorkspaceSettingsGeneralComponent)
  })

  it('renders existing organization sharing and saves it as private when switched off', async () => {
    await render(workspace('organization-shared'))
    expect(sharingSwitch().checked).toBe(true)
    expect(sharingSwitch().disabled).toBe(false)
    expect(fixture.debugElement.nativeElement.textContent).toContain('Organization shared')

    workspaceService.updateVisibility.mockReturnValue(of(workspace('private')))
    const updated = jest.fn()
    fixture.componentInstance.updated.subscribe(updated)
    sharingSwitch().click()
    await fixture.whenStable()
    await fixture.componentInstance.update()

    expect(workspaceService.updateVisibility).toHaveBeenCalledWith('workspace-1', 'private')
    expect(fixture.componentInstance.savedVisibility()).toBe('private')
    expect(updated).toHaveBeenCalled()
  })

  it.each([
    ['org-1', 'organization-shared'],
    [undefined, 'tenant-shared']
  ] as const)('saves sharing for the workspace scope %s', async (organizationId, visibility) => {
    const initial = { ...workspace('private'), organizationId }
    await render(initial)
    workspaceService.updateVisibility.mockReturnValue(of({ ...initial, settings: { access: { visibility } } }))
    sharingSwitch().click()
    await fixture.whenStable()
    await fixture.componentInstance.update()

    expect(workspaceService.updateVisibility).toHaveBeenCalledWith('workspace-1', visibility)
    expect(fixture.componentInstance.savedVisibility()).toBe(visibility)
  })

  it('renders tenant sharing and preserves it when updating only the name', async () => {
    await render({ ...workspace('tenant-shared'), organizationId: undefined })
    expect(sharingSwitch().checked).toBe(true)
    expect(fixture.debugElement.nativeElement.textContent).toContain('Tenant shared')
    workspaceService.update.mockReturnValue(of({}))
    fixture.componentInstance.name.set('Renamed')
    await fixture.componentInstance.update()

    expect(workspaceService.update).toHaveBeenCalledWith('workspace-1', { name: 'Renamed' })
    expect(workspaceService.updateVisibility).not.toHaveBeenCalled()
  })

  it('disables sharing and rejects updates for a member without management rights', async () => {
    const value = workspace('organization-shared')
    value.capabilities.canManage = false
    await render(value)
    expect(sharingSwitch().disabled).toBe(true)
    await fixture.componentInstance.update()
    expect(workspaceService.updateVisibility).not.toHaveBeenCalled()
    expect(workspaceService.update).not.toHaveBeenCalled()
  })

  it('keeps the saved visibility and reports a failed save', async () => {
    await render(workspace('private'))
    workspaceService.updateVisibility.mockReturnValue(throwError(() => new Error('Save failed')))
    fixture.componentInstance.shared.set(true)
    await fixture.componentInstance.update()

    expect(fixture.componentInstance.savedVisibility()).toBe('private')
    expect(fixture.componentInstance.loading()).toBe(false)
    expect(toastr.error).toHaveBeenCalled()
    expect(toastr.success).not.toHaveBeenCalled()
    expect(workspaceService.refresh).not.toHaveBeenCalled()
  })
})
