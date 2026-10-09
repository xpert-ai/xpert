import { TestBed } from '@angular/core/testing'
import { Dialog } from '@angular/cdk/dialog'
import { TranslateModule } from '@ngx-translate/core'
import { PluginApplicationToolsetRequirement } from '@xpert-ai/contracts'
import { PluginApplicationService, ToastrService, XpertToolsetService } from '@cloud/app/@core'
import { of, Subject, throwError } from 'rxjs'
import { ApplicationToolsetsComponent } from './app-toolsets.component'
import { applicationToolsetsSelected, reconcileApplicationToolsets } from './app-toolsets.util'

jest.mock('../../xpert/tools/builtin/configure/configure.component', () => ({
  XpertToolConfigureBuiltinComponent: class {}
}))

const requirement: PluginApplicationToolsetRequirement = {
  key: 'images',
  pluginName: '@acme/tools',
  provider: 'images',
  label: 'Image generation',
  providerAvailable: true,
  options: [{ id: 'source', name: 'My account', workspaceName: 'Design' }]
}

describe('application toolset choices', () => {
  it('requires an explicit eligible choice and tolerates apps without toolsets', () => {
    expect(applicationToolsetsSelected([], [])).toBe(true)
    expect(applicationToolsetsSelected([requirement], [])).toBe(false)
    expect(applicationToolsetsSelected([requirement], [{ key: 'images', toolsetId: 'source' }])).toBe(true)
    expect(
      applicationToolsetsSelected(
        [{ ...requirement, providerAvailable: false }],
        [{ key: 'images', toolsetId: 'source' }]
      )
    ).toBe(false)
  })
  it('keeps authorized choices across refresh and removes revoked ones', () => {
    const choices = [{ key: 'images', toolsetId: 'source' }]
    expect(reconcileApplicationToolsets([requirement], choices)).toEqual(choices)
    expect(reconcileApplicationToolsets([{ ...requirement, options: [] }], choices)).toEqual([])
  })
  it('uses the managed instance when repairing an application', () => {
    const managed = {
      ...requirement,
      configuredToolsetId: 'managed',
      options: [{ id: 'managed', name: 'App images' }, ...requirement.options]
    }
    expect(reconcileApplicationToolsets([managed], [{ key: 'images', toolsetId: 'source' }])).toEqual([
      { key: 'images', toolsetId: 'managed' }
    ])
  })
})

describe('application toolset setup UI', () => {
  const application = { pluginName: '@acme/app', appName: 'example' }
  const prepared = { status: 'configuring', workspaceId: 'prepared-workspace', canDiscardConfiguration: true }
  const applications = { prepare: jest.fn(), bindToolset: jest.fn() }
  const dialog = { open: jest.fn() }
  const toolsets = { getById: jest.fn() }
  const toastr = { error: jest.fn() }
  beforeEach(() => {
    applications.prepare.mockReset().mockReturnValue(of(prepared))
    applications.bindToolset.mockReset().mockReturnValue(of(prepared))
    dialog.open.mockReset().mockReturnValue({ closed: of({ id: 'saved' }) })
    toolsets.getById.mockReset()
    toastr.error.mockReset()
    TestBed.configureTestingModule({
      imports: [ApplicationToolsetsComponent, TranslateModule.forRoot()],
      providers: [
        { provide: ToastrService, useValue: toastr },
        { provide: PluginApplicationService, useValue: applications },
        { provide: XpertToolsetService, useValue: toolsets },
        { provide: Dialog, useValue: dialog }
      ]
    })
  })
  afterEach(() => TestBed.resetTestingModule())

  it('renders selection and configuration actions, and emits the selected source ID', async () => {
    const fixture = TestBed.createComponent(ApplicationToolsetsComponent)
    fixture.componentRef.setInput('application', application)
    fixture.componentRef.setInput('requirements', [requirement])
    fixture.detectChanges()
    await fixture.whenStable()
    const host: HTMLElement = fixture.nativeElement
    expect(host.textContent).toContain('Image generation')
    expect(host.querySelector('z-select')).not.toBeNull()
    fixture.componentInstance.select('images', 'source')
    expect(fixture.componentInstance.selections()).toEqual([{ key: 'images', toolsetId: 'source' }])
    fixture.componentRef.setInput('disabled', true)
    fixture.detectChanges()
    expect([...host.querySelectorAll('button')].every((button) => button.disabled)).toBe(true)
    await fixture.whenStable()
    fixture.destroy()
  })

  it('shows missing provider guidance instead of accepting a configuration', () => {
    const fixture = TestBed.createComponent(ApplicationToolsetsComponent)
    fixture.componentRef.setInput('application', application)
    fixture.componentRef.setInput('requirements', [{ ...requirement, providerAvailable: false, options: [] }])
    fixture.detectChanges()
    const host: HTMLElement = fixture.nativeElement
    expect(host.querySelector('z-select')).toBeNull()
    expect(host.textContent).toContain('XP.Explore.Application.Toolsets.ProviderMissing')
    fixture.destroy()
  })

  it('prepares a real Workspace before opening configuration, then persists its binding', async () => {
    const fixture = TestBed.createComponent(ApplicationToolsetsComponent)
    fixture.componentRef.setInput('application', { ...application, id: 'app', scope: 'organization', config: {} })
    const refresh = jest.fn()
    fixture.componentInstance.refresh.subscribe(refresh)
    await fixture.componentInstance.configure(requirement)
    expect(applications.prepare).toHaveBeenCalledWith(application)
    expect(dialog.open).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        data: expect.objectContaining({ workspaceId: 'prepared-workspace', providerName: 'images' })
      })
    )
    expect(applications.prepare.mock.invocationCallOrder[0]).toBeLessThan(dialog.open.mock.invocationCallOrder[0])
    expect(applications.bindToolset).toHaveBeenCalledWith({ ...application, key: 'images', toolsetId: 'saved' })
    expect(fixture.componentInstance.selections()).toEqual([{ key: 'images', toolsetId: 'saved' }])
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(toastr.error).not.toHaveBeenCalled()
    fixture.destroy()
  })

  it('keeps saved configuration editable when the setup drawer is reopened', async () => {
    const fixture = TestBed.createComponent(ApplicationToolsetsComponent)
    fixture.componentRef.setInput('application', application)
    toolsets.getById.mockReturnValue(of({ id: 'saved', tools: [{ name: 'generate' }] }))
    await fixture.componentInstance.configure({ ...requirement, configuredToolsetId: 'saved' })
    expect(dialog.open).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        data: expect.objectContaining({
          toolset: { id: 'saved', tools: [{ name: 'generate' }] },
          tools: [{ name: 'generate' }]
        })
      })
    )
    fixture.destroy()
  })

  it('does not open a dialog on prepare failure or a missing Workspace ID', async () => {
    const fixture = TestBed.createComponent(ApplicationToolsetsComponent)
    fixture.componentRef.setInput('application', application)
    applications.prepare
      .mockReturnValueOnce(throwError(() => new Error('denied')))
      .mockReturnValueOnce(of({ status: 'configuring', workspaceId: null }))
    await fixture.componentInstance.configure(requirement)
    await fixture.componentInstance.configure(requirement)
    expect(dialog.open).not.toHaveBeenCalled()
    expect(applications.bindToolset).not.toHaveBeenCalled()
    expect(toastr.error).toHaveBeenCalledTimes(2)
    expect(fixture.componentInstance.configuring()).toBe(false)
    fixture.destroy()
  })

  it('selects a repair source without replacing a published managed binding', async () => {
    const fixture = TestBed.createComponent(ApplicationToolsetsComponent)
    fixture.componentRef.setInput('application', application)
    applications.prepare.mockReturnValue(of({ ...prepared, status: 'degraded', canDiscardConfiguration: false }))
    await fixture.componentInstance.configure(requirement)
    expect(dialog.open).toHaveBeenCalled()
    expect(applications.bindToolset).not.toHaveBeenCalled()
    expect(fixture.componentInstance.selections()).toEqual([{ key: 'images', toolsetId: 'saved' }])
    fixture.destroy()
  })

  it('prevents duplicate prepare clicks and treats closing the dialog as preserving the draft', async () => {
    const fixture = TestBed.createComponent(ApplicationToolsetsComponent)
    fixture.componentRef.setInput('application', application)
    const pending = new Subject<typeof prepared>()
    applications.prepare.mockReturnValue(pending)
    dialog.open.mockReturnValue({ closed: of(true) })
    const configuring = fixture.componentInstance.configure(requirement)
    await fixture.componentInstance.configure(requirement)
    expect(applications.prepare).toHaveBeenCalledTimes(1)
    pending.next(prepared)
    pending.complete()
    await configuring
    expect(applications.bindToolset).not.toHaveBeenCalled()
    expect(fixture.componentInstance.configuring()).toBe(false)
    fixture.destroy()
  })
})
