import { DialogRef } from '@angular/cdk/dialog'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'
import { TranslateService, TranslateModule } from '@ngx-translate/core'
import { BehaviorSubject, of } from 'rxjs'

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
  const receipt = {
    id: 'operation',
    templateId: 'template',
    workspaceId: 'workspace',
    status: 'succeeded',
    stage: 'completed',
    attempt: 1,
    publish: true,
    assistantId: 'assistant',
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
  const xperts = { getById: jest.fn(() => of({ id: 'assistant' })) }
  async function settle() {
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    await fixture.whenStable()
  }
  beforeEach(async () => {
    localStorage.clear()
    jest.clearAllMocks()
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
})
