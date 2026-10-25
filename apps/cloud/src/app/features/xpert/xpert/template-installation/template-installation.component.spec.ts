import { Dialog, DialogModule, DialogRef } from '@angular/cdk/dialog'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'
import { By } from '@angular/platform-browser'
import { OverlayContainer } from '@angular/cdk/overlay'
import { TranslateService, TranslateModule } from '@ngx-translate/core'
import { BehaviorSubject, of, Subject, throwError } from 'rxjs'
import { AiModelTypeEnum, ModelFeature } from '@xpert-ai/contracts'
import type { TemplateInstallation, XpertTemplateSetup } from '@xpert-ai/contracts'

jest.mock('@cloud/app/@core', () => ({
  AiProviderRole: { Primary: 'primary' },
  CopilotServerService: class {},
  XpertAPIService: class {},
  XpertTemplateService: class {},
  XpertWorkspaceService: class {},
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error))
}))
jest.mock('@cloud/app/@core/state', () => ({ Store: class {}, API_PREFIX: '/api' }))
jest.mock('@cloud/app/@core/services/copilot-server.service', () => ({ CopilotServerService: class {} }))
jest.mock('@cloud/app/@core/services/copilot-provider.service', () => {
  const CopilotProviderService = class {}
  return {
    CopilotProviderService,
    injectCopilotProviderService: () => jest.requireActual('@angular/core').inject(CopilotProviderService)
  }
})
import { CopilotModelSelectComponent } from '@cloud/app/@shared/copilot/copilot-model-select/select.component'
import { CopilotServerService as CatalogService } from '@cloud/app/@core/services/copilot-server.service'
import { CopilotProviderService } from '@cloud/app/@core/services/copilot-provider.service'
import { CopilotServerService, XpertAPIService, XpertTemplateService, XpertWorkspaceService } from '@cloud/app/@core'
import { Store } from '@cloud/app/@core/state'
import { TemplateInstallationService } from '@cloud/app/@core/services/template-installation.service'
import { TemplateInstallationComponent } from './template-installation.component'

describe('Web template installation flow', () => {
  let fixture: ComponentFixture<TemplateInstallationComponent>
  const organization = new BehaviorSubject('org')
  const setup: XpertTemplateSetup = {
    canInstall: true,
    requiresModel: true,
    requiredModelFeatures: [ModelFeature.TOOL_CALL],
    defaultModelId: 'compatible',
    models: [
      {
        id: 'compatible',
        label: 'Compatible',
        copilotModel: { copilotId: 'provider', model: 'model', modelType: AiModelTypeEnum.LLM }
      }
    ],
    optionalCapabilities: [],
    realtimeModels: []
  }
  const templates = {
    getTemplate: jest.fn(() => of({ id: 'template', name: 'Template' })),
    getSetup: jest.fn(() => of(setup))
  }
  const workspaceResult = {
    items: [
      { id: 'workspace', name: 'Workspace', capabilities: { canWrite: true } },
      { id: 'readonly', name: 'Read only', capabilities: { canWrite: false } }
    ]
  }
  const workspaces = { getAllMy: jest.fn(() => of(workspaceResult)) }
  const catalog = {
    getCopilotModels: jest.fn(() =>
      of([
        {
          id: 'provider',
          name: 'Primary',
          role: 'primary',
          modelProvider: { id: 'provider-metadata' },
          providerWithModels: {
            provider: 'test',
            label: { en_US: 'Test Provider' },
            models: [
              { model: 'model', model_type: AiModelTypeEnum.LLM, features: [ModelFeature.MULTI_TOOL_CALL] },
              { model: 'ineligible', model_type: AiModelTypeEnum.LLM, features: [] }
            ]
          }
        },
        {
          id: 'tenant',
          name: 'Tenant connection',
          role: 'secondary',
          modelProvider: { id: 'tenant-metadata' },
          providerWithModels: {
            provider: 'tenant',
            label: { en_US: 'Tenant Provider' },
            models: [
              { model: 'model', model_type: AiModelTypeEnum.LLM, features: [ModelFeature.TOOL_CALL] },
              { model: 'other', model_type: AiModelTypeEnum.LLM, features: [ModelFeature.TOOL_CALL] }
            ]
          }
        }
      ])
    )
  }
  const parameters = { getModelParameterRules: jest.fn(() => of([])) }
  const picker = () =>
    fixture.debugElement.query(By.directive(CopilotModelSelectComponent))?.componentInstance as
      | CopilotModelSelectComponent
      | undefined
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
    fixture.autoDetectChanges()
    await fixture.whenStable()
  }
  beforeEach(async () => {
    localStorage.clear()
    jest.clearAllMocks()
    transport.create.mockImplementation(async () => receipt)
    transport.get.mockImplementation(async () => receipt)
    xperts.getById.mockImplementation(() => of({ id: 'assistant' }))
    organization.next('org')
    workspaces.getAllMy.mockImplementation(() => of(workspaceResult))
    templates.getSetup.mockImplementation(() => of(setup))
    templates.getTemplate.mockImplementation(() => of({ id: 'template', name: 'Template' }))
    await TestBed.configureTestingModule({
      imports: [DialogModule, TemplateInstallationComponent, TranslateModule.forRoot()],
      providers: [
        {
          provide: Store,
          useValue: { selectOrganizationId: () => organization, user$: of({ id: 'user', tenantId: 'tenant' }) }
        },
        { provide: TemplateInstallationService, useValue: transport },
        { provide: XpertTemplateService, useValue: templates },
        { provide: XpertWorkspaceService, useValue: workspaces },
        { provide: XpertAPIService, useValue: xperts },
        { provide: CopilotServerService, useValue: primary },
        { provide: CatalogService, useValue: catalog },
        { provide: CopilotProviderService, useValue: parameters },
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
    TestBed.inject(OverlayContainer).getContainerElement().replaceChildren()
    localStorage.clear()
  })
  it('preserves editable workspaces when the package on this replica is unavailable', async () => {
    templates.getTemplate.mockImplementation(() => throwError(() => new Error('Plugin files unavailable')))
    templates.getSetup.mockClear()
    organization.next('unavailable-package-org')
    await settle()
    const component = fixture.componentInstance
    expect(component.workspaces().map((workspace) => workspace.id)).toEqual(['workspace'])
    expect(component.error()).toBe('Plugin files unavailable')
    expect(component.canStart()).toBeFalsy()
    expect(button('XP.Installation.Install').disabled).toBe(true)
    expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain('Plugin files unavailable')
    expect(templates.getSetup).not.toHaveBeenCalled()
    expect(fixture.nativeElement.querySelector('select').textContent).toContain('Workspace')
  })
  it('retries the failed template without dropping workspace selection or starting installation', async () => {
    templates.getTemplate.mockReturnValueOnce(throwError(() => new Error('Plugin files unavailable')))
    fixture.componentRef.setInput('templateId', 'recoverable')
    await settle()
    const component = fixture.componentInstance
    const workspaceCalls = workspaces.getAllMy.mock.calls.length
    expect(component.canStart()).toBeFalsy()
    component.refreshSettings()
    await settle()
    expect(component.error()).toBe('')
    expect(component.workspaceId()).toBe('workspace')
    expect(workspaces.getAllMy).toHaveBeenCalledTimes(workspaceCalls)
    expect(component.canStart()).toBe(true)
    expect(button('XP.Installation.Install').disabled).toBe(false)
    expect(transport.create).not.toHaveBeenCalled()
  })
  it('keeps a successful template when workspaces fail and retries only the failed request', async () => {
    workspaces.getAllMy.mockReturnValueOnce(throwError(() => new Error('Workspace request failed')))
    organization.next('other')
    await settle()
    const component = fixture.componentInstance
    const templateCalls = templates.getTemplate.mock.calls.length
    expect(component.template()?.name).toBe('Template')
    expect(component.error()).toBe('Workspace request failed')
    expect(component.canStart()).toBeFalsy()
    component.refreshSettings()
    await settle()
    expect(templates.getTemplate).toHaveBeenCalledTimes(templateCalls)
    expect(component.canStart()).toBe(true)
  })
  it('shows available workspaces during a pending template and ignores a late error after scope changes', async () => {
    const pending = new Subject<{ id: string; name: string }>()
    templates.getTemplate.mockReturnValueOnce(pending)
    fixture.componentRef.setInput('templateId', 'pending')
    await settle()
    expect(fixture.componentInstance.workspaces()).toHaveLength(1)
    expect(fixture.componentInstance.canStart()).toBeFalsy()
    const calls = templates.getTemplate.mock.calls.length
    fixture.componentInstance.refreshSettings()
    expect(templates.getTemplate).toHaveBeenCalledTimes(calls)
    organization.next('new-org')
    await settle()
    pending.error(new Error('old scope error'))
    await settle()
    expect(fixture.componentInstance.error()).toBe('')
    expect(fixture.componentInstance.canStart()).toBe(true)
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
    const select = picker()
    expect(select).toBeDefined()
    expect(select.required()).toBe(true)
    const trigger: HTMLElement = fixture.nativeElement.querySelector('.model-select-trigger')
    trigger.click()
    await settle()
    const menu = TestBed.inject(OverlayContainer).getContainerElement()
    const option = Array.from(menu.querySelectorAll<HTMLButtonElement>('[cdkMenuItem]')).find((item) =>
      item.textContent.includes('model')
    )
    expect(option).toBeDefined()
    option.click()
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
      copilotModel: { copilotId: 'tenant', model: 'other', modelType: AiModelTypeEnum.LLM }
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
  it('uses only setup identities while retaining server-approved multi-tool-call models and provider metadata', async () => {
    const select = picker()
    expect(select.allowedModels()).toEqual(setup.models.map((option) => option.copilotModel))
    expect(select.features()).toBeUndefined()
    expect(select.featureFilteredCopilots().map((item) => item.id)).toEqual(['provider'])
    expect(select.featureFilteredCopilots()[0].providerWithModels.models.map((item) => item.model)).toEqual(['model'])
    expect(select.selectedAiModel().features).toEqual([ModelFeature.MULTI_TOOL_CALL])
    expect(fixture.nativeElement.textContent).toContain('model')
    expect(select.showParameters()).toBe(false)
    expect(parameters.getModelParameterRules).not.toHaveBeenCalled()
    expect(fixture.nativeElement.querySelector('select[formControlName="model"]')).toBeNull()
    fixture.nativeElement.querySelector('.model-select-trigger').click()
    await settle()
    const menu = TestBed.inject(OverlayContainer).getContainerElement()
    expect(menu.textContent).toContain('Test Provider')
    expect(menu.textContent).not.toContain('Tenant Provider')
    expect(menu.textContent).not.toContain('ineligible')
  })
  it('opens the menu and selects a model with the keyboard', async () => {
    const component = fixture.componentInstance
    component.selectModel(null)
    await settle()
    const trigger: HTMLElement = fixture.nativeElement.querySelector('.model-select-trigger')
    trigger.focus()
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }))
    await settle()
    const option = TestBed.inject(OverlayContainer)
      .getContainerElement()
      .querySelector<HTMLElement>('[role="menuitem"]')
    expect(option).not.toBeNull()
    option.focus()
    option.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }))
    await settle()
    expect(component.form.controls.model.value).toBe('compatible')
    expect(TestBed.inject(OverlayContainer).getContainerElement().querySelector('[cdkMenu]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(component.canStart()).toBe(true)
  })
  it('closes only the model menu on Escape inside a real CDK dialog', async () => {
    const dialogs = TestBed.inject(Dialog)
    const ref = fixture.ngZone.run(() => {
      const ref = dialogs.open(TemplateInstallationComponent)
      ref.componentRef.setInput('templateId', 'template')
      return ref
    })
    try {
      await settle()
      const trigger: HTMLElement = ref.componentRef.location.nativeElement.querySelector('.model-select-trigger')
      trigger.click()
      await settle()
      const overlay = TestBed.inject(OverlayContainer).getContainerElement()
      const search = overlay.querySelector<HTMLInputElement>('input[type="search"]')
      expect(search).not.toBeNull()
      search.focus()
      search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }))
      await settle()
      expect(overlay.querySelector('[cdkMenu]')).toBeNull()
      expect(dialogs.openDialogs).toContain(ref)
      expect(document.activeElement).toBe(trigger)
    } finally {
      ref.close()
    }
  })
  it('resolves same-name models by connection and submits only the selected setup identity', async () => {
    const second = {
      id: 'opaque-second-option',
      label: 'Same model on tenant',
      copilotModel: {
        copilotId: 'tenant',
        model: 'model',
        modelType: AiModelTypeEnum.LLM
      }
    }
    templates.getSetup.mockReturnValueOnce(of({ ...setup, models: [...setup.models, second] }))
    const component = fixture.componentInstance
    component.revision.update((value) => value + 1)
    await settle()
    const select = picker()
    const connection = select.featureFilteredCopilots().find((item) => item.id === 'tenant')
    select.setModel(connection, connection.providerWithModels.models[0])
    await settle()
    expect(component.form.controls.model.value).toBe('opaque-second-option')
    expect(component.selectedModel()).toEqual(second.copilotModel)
    await component.start()
    expect(transport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        basic: { title: 'Template', copilotModel: second.copilotModel }
      })
    )
  })
  it.each([
    { copilotId: 'tenant', model: 'model', modelType: AiModelTypeEnum.LLM },
    { copilotId: 'provider', model: 'model', modelType: AiModelTypeEnum.TEXT_EMBEDDING },
    { copilotId: 'provider', model: 'ineligible', modelType: AiModelTypeEnum.LLM }
  ])('rejects an out-of-setup selection even for an optional model: %j', async (value) => {
    const component = fixture.componentInstance
    templates.getSetup.mockReturnValueOnce(of({ ...setup, requiresModel: false, requiredModelFeatures: [] }))
    component.revision.update((revision) => revision + 1)
    await settle()
    component.selectModel(value)
    expect(component.form.controls.model.hasError('modelUnavailable')).toBe(true)
    await component.start()
    expect(transport.create).not.toHaveBeenCalled()
  })
  it('clears the shared selector and blocks a required selection until a model is chosen again', async () => {
    picker().delete()
    await settle()
    expect(fixture.componentInstance.form.controls.model.value).toBe('')
    expect(fixture.componentInstance.form.controls.model.hasError('required')).toBe(true)
    expect(fixture.componentInstance.canStart()).toBe(false)
    expect(picker().model()).toBeUndefined()
    await fixture.componentInstance.start()
    expect(transport.create).not.toHaveBeenCalled()
  })
  it('allows clearing an optional model and omits it from the installation payload', async () => {
    templates.getSetup.mockReturnValueOnce(of({ ...setup, requiresModel: false, requiredModelFeatures: [] }))
    fixture.componentInstance.revision.update((value) => value + 1)
    await settle()
    picker().delete()
    await settle()
    expect(fixture.componentInstance.canStart()).toBe(true)
    await fixture.componentInstance.start()
    expect(transport.create).toHaveBeenCalledWith(expect.objectContaining({ basic: { title: 'Template' } }))
  })
  it('does not select a default absent from the eligible catalog', async () => {
    templates.getSetup.mockReturnValueOnce(of({ ...setup, defaultModelId: 'missing' }))
    fixture.componentInstance.form.controls.model.setValue('')
    fixture.componentInstance.revision.update((value) => value + 1)
    await settle()
    expect(fixture.componentInstance.selectedModel()).toBeNull()
    expect(fixture.componentInstance.canStart()).toBe(false)
  })
  it('closes an open overlay and rejects selection changes while an installation request is busy', async () => {
    const component = fixture.componentInstance
    const select = picker()
    fixture.nativeElement.querySelector('.model-select-trigger').click()
    await settle()
    const overlay = TestBed.inject(OverlayContainer).getContainerElement()
    expect(overlay.querySelector('[cdkMenu]')).not.toBeNull()
    let finish: (value: TemplateInstallation) => void = () => undefined
    transport.create.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const starting = component.start()
    await settle()
    expect(component.state().busy).toBe(true)
    expect(select.interactionDisabled()).toBe(true)
    expect(overlay.querySelector('[cdkMenu]')).toBeNull()
    select.delete()
    component.selectModel(null)
    expect(component.form.controls.model.value).toBe('compatible')
    finish(receipt)
    await starting
  })
  it.each(['workspace', 'organization'])('discards a late setup response after a %s change', async (scope) => {
    const stale = new Subject<XpertTemplateSetup>()
    const current = new Subject<XpertTemplateSetup>()
    templates.getSetup.mockReturnValueOnce(stale).mockReturnValueOnce(current)
    const component = fixture.componentInstance
    component.revision.update((value) => value + 1)
    await settle()
    expect(component.canStart()).toBeFalsy()
    expect(picker()).toBeUndefined()
    if (scope === 'workspace') component.workspaceId.set('second-workspace')
    else organization.next('second-org')
    await settle()
    current.next({ ...setup, models: [], defaultModelId: undefined, canInstall: false, reason: 'No authorized model' })
    current.complete()
    await settle()
    stale.next(setup)
    stale.complete()
    await settle()
    expect(component.setup().models).toEqual([])
    expect(component.form.controls.model.value).toBe('')
    expect(component.canStart()).toBe(false)
    expect(fixture.nativeElement.textContent).toContain('No authorized model')
    await component.start()
    expect(transport.create).not.toHaveBeenCalled()
  })
  it('keeps installation blocked after a setup refresh fails', async () => {
    templates.getSetup.mockReturnValueOnce(throwError(() => new Error('setup unavailable')))
    fixture.componentInstance.revision.update((value) => value + 1)
    await settle()
    expect(picker()).toBeUndefined()
    expect(fixture.componentInstance.canStart()).toBeFalsy()
    expect(fixture.nativeElement.textContent).toContain('setup unavailable')
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
        basic: {
          title: 'Template',
          copilotModel: { copilotId: 'provider', model: 'model', modelType: AiModelTypeEnum.LLM }
        }
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
  it.each(['queued', 'running', 'failed'] as const)(
    'does not notify assistant lists of a successful publication for a %s installation',
    async (status) => {
      const operation: TemplateInstallation = { ...receipt, status, stage: 'importing' }
      transport.create.mockResolvedValueOnce(operation)
      transport.get.mockResolvedValueOnce(operation)
      const component = fixture.componentInstance
      const completed = jest.spyOn(component.completed, 'emit')
      await component.start()
      await component.client.refresh()
      expect(xperts.refresh).not.toHaveBeenCalled()
      expect(completed).not.toHaveBeenCalled()
    }
  )
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
    templates.getSetup.mockReturnValueOnce(throwError(() => new Error('setup failed')))
    component.revision.update((value) => value + 1)
    await settle()
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
