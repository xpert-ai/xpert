import { DialogRef } from '@angular/cdk/dialog'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'
import { TranslateService, TranslateModule } from '@ngx-translate/core'
import { BehaviorSubject, of, Subject, throwError } from 'rxjs'
import type { TemplateInstallation } from '@xpert-ai/contracts'

jest.mock('@cloud/app/@core', () => ({
  AiProviderRole: { Primary: 'primary' },
  CopilotServerService: class {},
  XpertAPIService: class {},
  XpertTemplateService: class {},
  XpertWorkspaceService: class {},
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error))
}))
jest.mock('@cloud/app/@core/state', () => ({ Store: class {}, API_PREFIX: '/api' }))
jest.mock('@xpert-ai/headless-ui', () => ({
  XpDialogFrameImports: [],
  ZardButtonComponent: jest.requireActual(
    '../../../../../../../../packages/ui/src/lib/components/button/button.component'
  ).ZardButtonComponent,
  ZardInputDirective: jest.requireActual('../../../../../../../../packages/ui/src/lib/components/input/input.directive')
    .ZardInputDirective
}))
import { CopilotServerService, XpertAPIService, XpertTemplateService, XpertWorkspaceService } from '@cloud/app/@core'
import { Store } from '@cloud/app/@core/state'
import { TemplateInstallationService } from '@cloud/app/@core/services/template-installation.service'
import { TemplateInstallationComponent } from './template-installation.component'

describe('Web template installation flow', () => {
  let fixture: ComponentFixture<TemplateInstallationComponent>
  const organization = new BehaviorSubject('org')
  const setup = {
    canInstall: true,
    requiresModel: true,
    requiredModelFeatures: ['tool_call'],
    defaultModelId: 'compatible',
    models: [
      {
        id: 'compatible',
        label: 'Compatible',
        copilotModel: { copilotId: 'provider', model: 'model', modelType: 'llm' }
      }
    ],
    optionalCapabilities: [],
    realtimeModels: []
  }
  const templates = {
    getTemplate: jest.fn(() => of({ id: 'template', name: 'Template' })),
    getSetup: jest.fn(() => of(setup))
  }
  const primary = { getAvailableByRole: jest.fn(() => of(null)) }
  const receipt: TemplateInstallation = {
    id: 'operation',
    templateId: 'template',
    workspaceId: 'workspace',
    status: 'succeeded',
    stage: 'completed',
    attempt: 1,
    publish: true,
    assistantId: 'assistant',
    assistantAvailability: 'available',
    retryable: false,
    resourceInstallationIds: [],
    pendingAuthInstallationIds: ['connection'],
    createdAt: '',
    updatedAt: '',
    error: null
  }
  const transport = {
    create: jest.fn(async () => receipt),
    get: jest.fn(async () => receipt),
    retry: jest.fn(),
    list: jest.fn(async () => ({ items: [], total: 0 }))
  }
  const router = { navigate: jest.fn(async () => true) }
  const dialog = { close: jest.fn() }
  const xperts = { getById: jest.fn(() => of({ id: 'assistant' })), refresh: jest.fn() }
  const button = (label: string) =>
    Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('button')).find((item) =>
      item.textContent.includes(label)
    )
  async function settle() {
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    await fixture.whenStable()
  }
  beforeEach(async () => {
    localStorage.clear()
    jest.clearAllMocks()
    transport.create.mockImplementation(async () => receipt)
    transport.get.mockImplementation(async () => receipt)
    xperts.getById.mockImplementation(() => of({ id: 'assistant' }))
    organization.next('org')
    templates.getSetup.mockImplementation(() => of(setup))
    await TestBed.configureTestingModule({
      imports: [TemplateInstallationComponent, TranslateModule.forRoot()],
      providers: [
        {
          provide: Store,
          useValue: { selectOrganizationId: () => organization, user$: of({ id: 'user', tenantId: 'tenant' }) }
        },
        { provide: TemplateInstallationService, useValue: transport },
        { provide: XpertTemplateService, useValue: templates },
        {
          provide: XpertWorkspaceService,
          useValue: {
            getAllMy: () =>
              of({
                items: [
                  { id: 'workspace', name: 'Workspace', capabilities: { canWrite: true } },
                  { id: 'readonly', capabilities: { canWrite: false } }
                ]
              })
          }
        },
        { provide: XpertAPIService, useValue: xperts },
        { provide: CopilotServerService, useValue: primary },
        { provide: Router, useValue: router },
        { provide: DialogRef, useValue: dialog }
      ]
    }).compileComponents()
    const translate = TestBed.inject(TranslateService)
    translate.setTranslation('en', {
      XP: {
        Installation: {
          Open: 'Open assistant',
          Another: 'Create another assistant',
          Configure: 'Configure connections',
          AssistantUnavailable: 'This assistant was deleted or is no longer accessible.'
        }
      }
    })
    translate.use('en')
    fixture = TestBed.createComponent(TemplateInstallationComponent)
    fixture.componentRef.setInput('templateId', 'template')
    await settle()
  })
  afterEach(() => {
    fixture.destroy()
    localStorage.clear()
  })
  it('accepts an authorized compatible model without requiring an organization default, and rejects stale model selection', () => {
    const component = fixture.componentInstance
    expect(primary.getAvailableByRole).not.toHaveBeenCalled()
    expect(component.workspaces().map((w) => w.id)).toEqual(['workspace'])
    expect(component.canStart()).toBe(true)
    component.form.controls.model.setValue('revoked')
    expect(component.canStart()).toBe(false)
  })
  it('lets an ordinary template select a tenant model without a Primary default and submits that binding', async () => {
    templates.getSetup.mockImplementation(() => of({ ...setup, requiredModelFeatures: [], defaultModelId: undefined }))
    const component = fixture.componentInstance
    component.form.controls.model.setValue('')
    component.revision.update((value) => value + 1)
    await settle()
    expect(primary.getAvailableByRole).not.toHaveBeenCalled()
    expect(component.canStart()).toBe(false)
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('[formControlName="model"]')
    expect(select).not.toBeNull()
    expect(select.required).toBe(true)
    select.value = 'compatible'
    select.dispatchEvent(new Event('change'))
    await settle()
    expect(component.canStart()).toBe(true)
    await component.start()
    expect(transport.create).toHaveBeenCalledWith(
      expect.objectContaining({ basic: { title: 'Template', copilotModel: setup.models[0].copilotModel } })
    )
  })
  it('preserves a valid user selection on refresh and clears a revoked one before enabling installation', async () => {
    const other = {
      id: 'other',
      label: 'Other',
      copilotModel: { copilotId: 'tenant', model: 'other', modelType: 'llm' }
    }
    templates.getSetup.mockImplementation(() => of({ ...setup, models: [...setup.models, other] }))
    const component = fixture.componentInstance
    component.form.controls.model.setValue('other')
    component.revision.update((value) => value + 1)
    await settle()
    expect(component.form.controls.model.value).toBe('other')
    templates.getSetup.mockImplementation(() => of({ ...setup, defaultModelId: undefined }))
    component.revision.update((value) => value + 1)
    fixture.detectChanges()
    expect(component.canStart()).toBeFalsy()
    await settle()
    expect(component.form.controls.model.value).toBe('')
    expect(component.canStart()).toBe(false)
    await component.start()
    expect(transport.create).not.toHaveBeenCalled()
  })
  it('shows the server reason when no authorized compatible model exists', async () => {
    templates.getSetup.mockImplementation(() =>
      of({ ...setup, canInstall: false, models: [], reason: 'No authorized compatible model is available.' })
    )
    fixture.componentInstance.revision.update((value) => value + 1)
    await settle()
    expect(fixture.nativeElement.textContent).toContain('No authorized compatible model is available.')
    expect(fixture.nativeElement.textContent).not.toContain('XP.Installation.PrimaryRequired')
    expect(fixture.componentInstance.canStart()).toBe(false)
  })
  it('opens the dedicated detail page and closes the installation dialog', async () => {
    expect(fixture.nativeElement.querySelector('xp-template-requirements')).toBeNull()
    const detailsButton = Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('button')).find(
      (button) => button.textContent.includes('XP.ACTIONS.ViewDetails')
    )
    detailsButton.click()
    await settle()
    expect(router.navigate).toHaveBeenCalledWith(['/explore/templates', 'template'])
    expect(dialog.close).toHaveBeenCalled()
    expect(transport.create).not.toHaveBeenCalled()
  })
  it('disables the real install button until missing dependencies are refreshed in the same workspace', async () => {
    templates.getSetup.mockImplementation(() => of({ ...setup, canInstall: false }))
    fixture.componentInstance.revision.update((value) => value + 1)
    await settle()
    const installButton = () =>
      Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('button')).find((button) =>
        button.textContent.includes('XP.Installation.Install')
      )
    expect(installButton()?.disabled).toBe(true)
    installButton()?.click()
    await settle()
    expect(transport.create).not.toHaveBeenCalled()
    templates.getSetup.mockImplementation(() => of(setup))
    fixture.componentInstance.revision.update((value) => value + 1)
    await settle()
    expect(templates.getSetup).toHaveBeenLastCalledWith('template', [], 'workspace')
    expect(installButton()?.disabled).toBe(false)
  })
  it('publishes through the durable service and preserves pending configuration when opening either destination', async () => {
    const component = fixture.componentInstance
    await component.start()
    expect(transport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: expect.any(String),
        publish: true,
        workspaceId: 'workspace',
        basic: { title: 'Template', copilotModel: { copilotId: 'provider', model: 'model', modelType: 'llm' } }
      })
    )
    expect(component.statusLabel(component.state().operation)).toBe('Configuration required')
    await component.open(component.state().operation, true)
    expect(router.navigate).toHaveBeenCalledWith(['/xpert/w', 'workspace', 'connectors'])
    expect(dialog.close).toHaveBeenCalled()
    const completed = jest.spyOn(component.completed, 'emit')
    await component.open(component.state().operation)
    expect(completed).toHaveBeenCalledWith({ xpert: { id: 'assistant' }, status: 'published' })
  })
  it('restores the existing operation and clears it when organization context changes', async () => {
    await fixture.componentInstance.start()
    fixture.destroy()
    fixture = TestBed.createComponent(TemplateInstallationComponent)
    fixture.componentRef.setInput('templateId', 'template')
    await settle()
    expect(fixture.componentInstance.state().operation.id).toBe('operation')
    expect(transport.create).toHaveBeenCalledTimes(1)
    organization.next('another-org')
    await settle()
    expect(fixture.componentInstance.state().operation).toBeNull()
  })
  it('refreshes the assistant list once per successful operation without requiring Open', async () => {
    const component = fixture.componentInstance
    const completed = jest.spyOn(component.completed, 'emit')
    transport.create.mockResolvedValueOnce({ ...receipt, status: 'running', stage: 'importing' })
    await component.start()
    expect(xperts.refresh).not.toHaveBeenCalled()
    await component.client.refresh()
    expect(xperts.refresh).toHaveBeenCalledTimes(1)
    expect(completed).not.toHaveBeenCalled()
    await component.client.refresh()
    await component.select(receipt)
    expect(xperts.refresh).toHaveBeenCalledTimes(1)
    component.newInstance()
    transport.create.mockResolvedValueOnce({ ...receipt, id: 'second', assistantId: 'second-assistant' })
    await component.start()
    expect(xperts.refresh).toHaveBeenCalledTimes(2)
  })
  it('restores deleted targets as historical successes and creates a distinct intent only on explicit submission', async () => {
    await fixture.componentInstance.start()
    fixture.destroy()
    transport.get.mockResolvedValue({ ...receipt, assistantAvailability: 'unavailable' })
    fixture = TestBed.createComponent(TemplateInstallationComponent)
    fixture.componentRef.setInput('templateId', 'template')
    await settle()
    await settle()
    const component = fixture.componentInstance
    expect(component.state().operation).toMatchObject({ status: 'succeeded', assistantAvailability: 'unavailable' })
    expect(button('Open assistant').disabled).toBe(true)
    expect(fixture.nativeElement.textContent).toContain('deleted or is no longer accessible')
    expect(button('Configure connections')).toBeUndefined()
    await component.client.refresh()
    await component.open(component.state().operation)
    expect(xperts.getById).not.toHaveBeenCalled()
    expect(transport.create).toHaveBeenCalledTimes(1)
    button('Create another assistant').click()
    await settle()
    expect(component.canStart()).toBe(true)
    expect(component.state().operation).toBeNull()
    await component.start()
    expect(transport.create).toHaveBeenCalledTimes(2)
    expect(transport.create.mock.calls[0]).not.toEqual(transport.create.mock.calls[1])
  })
  it('rechecks availability when opening and never opens a target deleted since the last receipt', async () => {
    const component = fixture.componentInstance
    await component.start()
    transport.get.mockResolvedValueOnce({ ...receipt, assistantAvailability: 'unavailable' })
    await component.open(component.state().operation)
    expect(xperts.getById).not.toHaveBeenCalled()
    expect(component.state().operation.assistantAvailability).toBe('unavailable')
  })
  it('recognizes deletion between the availability check and the assistant request', async () => {
    const component = fixture.componentInstance
    await component.start()
    transport.get
      .mockResolvedValueOnce(receipt)
      .mockResolvedValueOnce({ ...receipt, assistantAvailability: 'unavailable' })
    xperts.getById.mockReturnValueOnce(throwError(() => new Error('The requested record was not found')))
    await component.open(component.state().operation)
    expect(component.state().operation).toMatchObject({ status: 'succeeded', assistantAvailability: 'unavailable' })
    expect(component.openingError()).toBe('')
    expect(component.opening()).toBe(false)
  })
  it('does not open from a stale receipt when refreshing availability fails', async () => {
    const component = fixture.componentInstance
    await component.start()
    transport.get.mockRejectedValueOnce(new Error('offline'))
    await component.open(component.state().operation)
    expect(xperts.getById).not.toHaveBeenCalled()
    expect(component.state().error).toBe('offline')
    expect(component.state().operation.assistantAvailability).toBe('available')
    expect(component.opening()).toBe(false)
  })
  it('clears opening errors on new instance and history selection without hiding setup errors', async () => {
    const component = fixture.componentInstance
    await component.start()
    xperts.getById.mockReturnValueOnce(throwError(() => new Error('open failed')))
    await component.open(component.state().operation)
    expect(component.openingError()).toBe('open failed')
    await component.select(receipt)
    expect(component.openingError()).toBe('')
    xperts.getById.mockReturnValueOnce(throwError(() => new Error('open failed')))
    await component.open(component.state().operation)
    component.error.set('setup failed')
    component.newInstance()
    expect(component.openingError()).toBe('')
    expect(component.error()).toBe('setup failed')
    expect(component.state().operation).toBeNull()
  })
  it.each(
    ['new instance', 'scope change', 'history selection'].flatMap((change) =>
      ['failure', 'success'].map((outcome) => [outcome, change])
    )
  )('ignores late open %s after %s', async (outcome, change) => {
    const component = fixture.componentInstance
    const completed = jest.spyOn(component.completed, 'emit')
    await component.start()
    const pending = new Subject<{ id: string }>()
    xperts.getById.mockReturnValueOnce(pending)
    const opening = component.open(component.state().operation)
    await settle()
    expect(xperts.getById).toHaveBeenCalled()
    if (change === 'new instance') component.newInstance()
    else if (change === 'history selection') await component.select(receipt)
    else {
      organization.next('another-org')
      await settle()
    }
    if (outcome === 'failure') pending.error(new Error('late failure'))
    else {
      pending.next({ id: 'assistant' })
      pending.complete()
    }
    await opening
    expect(completed).not.toHaveBeenCalled()
    expect(component.openingError()).toBe('')
    expect(component.opening()).toBe(false)
  })
})
