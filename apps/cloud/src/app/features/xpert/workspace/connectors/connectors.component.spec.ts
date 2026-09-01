import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import type {
  ConnectorBinding,
  ConnectorConnectResponse,
  ConnectorOAuthStatusResponse,
  ConnectorStrategyDefinition
} from '@xpert-ai/plugin-sdk'
import { TranslateModule } from '@ngx-translate/core'
import { of } from 'rxjs'
import { ToastrService, XpertConnectorService, XpertWorkspaceService } from 'apps/cloud/src/app/@core'
import { XpertWorkspaceHomeComponent } from '../home/home.component'
import { ClawXpertConnectorsComponent, XpertConnectorsComponent } from './connectors.component'

jest.mock('apps/cloud/src/app/@core', () => {
  const { inject } = require('@angular/core')

  class ToastrService {}
  class XpertConnectorService {}
  class XpertWorkspaceService {}

  return {
    ToastrService,
    XpertConnectorService,
    XpertWorkspaceService,
    getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
    injectToastr: () => inject(ToastrService)
  }
})

jest.mock('../home/home.component', () => ({
  XpertWorkspaceHomeComponent: class XpertWorkspaceHomeComponent {}
}))

@Component({
  selector: 'xpert-connectors',
  standalone: true,
  template: ''
})
class StubXpertConnectorsComponent {}

const workspaceScope = { type: 'workspace' as const, workspaceId: 'workspace-1' }

const connectorDefinition: ConnectorStrategyDefinition = {
  provider: 'example',
  label: 'Example Connector',
  description: 'Connect an external workspace service',
  authorizationModes: ['personal', 'shared'],
  auth: {
    type: 'oauth2',
    authorizationUrl: '',
    tokenUrl: ''
  }
}

const legacyDefinition: ConnectorStrategyDefinition = {
  provider: 'legacy',
  label: 'Legacy Connector',
  auth: {
    type: 'oauth2',
    authorizationUrl: '',
    tokenUrl: ''
  }
}

const githubDefinition: ConnectorStrategyDefinition = {
  provider: 'github',
  label: 'GitHub',
  authorizationModes: ['personal', 'shared'],
  authMethods: [
    {
      id: 'github-app-oauth',
      type: 'oauth2',
      label: 'GitHub App OAuth',
      appCredentials: {
        fields: [
          { name: 'clientId', label: 'Client ID', required: true },
          { name: 'clientSecret', label: 'Client secret', required: true, type: 'password', secret: true }
        ]
      }
    },
    {
      id: 'pat',
      type: 'api_key',
      label: 'PAT',
      credentials: {
        fields: [{ name: 'token', label: 'Token', required: true, type: 'password', secret: true }]
      }
    }
  ]
}

const personalBinding: ConnectorBinding = {
  id: 'personal-binding',
  workspaceId: 'workspace-1',
  scopeType: 'workspace',
  scope: workspaceScope,
  authorizationMode: 'personal',
  provider: 'example',
  status: 'disconnected'
}

const sharedBinding: ConnectorBinding = {
  id: 'shared-binding',
  workspaceId: 'workspace-1',
  scopeType: 'workspace',
  scope: workspaceScope,
  authorizationMode: 'shared',
  provider: 'example',
  status: 'active',
  profile: { name: 'Team Account' }
}

const githubBinding: ConnectorBinding = {
  id: 'github-binding',
  workspaceId: 'workspace-1',
  scopeType: 'workspace',
  scope: workspaceScope,
  authorizationMode: 'personal',
  provider: 'github',
  authMethodId: 'pat',
  status: 'disconnected'
}

function createAuthorizationPopup() {
  const navigate = jest.fn()
  const focus = jest.fn()
  const close = jest.fn()
  const location = {}
  Object.defineProperty(location, 'href', { set: navigate })
  const popup = {
    opener: window,
    closed: false,
    close,
    focus,
    location
  } as unknown as Window
  return { popup, navigate, focus }
}

async function setup(options?: {
  canManage?: boolean
  definitions?: ConnectorStrategyDefinition[]
  bindings?: ConnectorBinding[]
  connectResponse?: ConnectorConnectResponse
  pollResponse?: ConnectorOAuthStatusResponse
}) {
  const workspace = signal({ id: 'workspace-1' })
  const connectorService = {
    scopedDefinitions: jest.fn(() => of(options?.definitions ?? [connectorDefinition])),
    listBindings: jest.fn(() => of(options?.bindings ?? [])),
    createBinding: jest.fn(() => of(personalBinding)),
    deleteBinding: jest.fn(() => of(null)),
    connectBinding: jest.fn(() =>
      of(
        options?.connectResponse ?? {
          status: 'active',
          connector: { ...personalBinding, status: 'active', profile: { name: 'My Account' } }
        }
      )
    ),
    bindingAuthorizationStatus: jest.fn(() =>
      of(
        options?.pollResponse ?? {
          connector: { ...personalBinding, status: 'active' },
          granted: true
        }
      )
    ),
    consentToBinding: jest.fn(() => of({ ...personalBinding, status: 'active', profile: { name: 'Existing Account' } }))
  }
  const toastr = {
    success: jest.fn(),
    error: jest.fn()
  }

  TestBed.resetTestingModule()
  await TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot(), XpertConnectorsComponent],
    providers: [
      {
        provide: XpertWorkspaceHomeComponent,
        useValue: { workspace }
      },
      {
        provide: XpertConnectorService,
        useValue: connectorService
      },
      {
        provide: XpertWorkspaceService,
        useValue: { canManage: jest.fn(() => options?.canManage ?? true) }
      },
      {
        provide: ToastrService,
        useValue: toastr
      }
    ]
  }).compileComponents()

  const fixture = TestBed.createComponent(XpertConnectorsComponent)
  fixture.detectChanges()
  await fixture.whenStable()

  return { fixture, component: fixture.componentInstance, connectorService, toastr }
}

describe('XpertConnectorsComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('loads workspace definitions and bindings through the scope-aware APIs', async () => {
    const { component, connectorService, fixture } = await setup({ bindings: [personalBinding] })

    await component.load('workspace-1')

    expect(connectorService.scopedDefinitions).toHaveBeenCalledWith('workspace', 'workspace-1')
    expect(connectorService.listBindings).toHaveBeenCalledWith('workspace', 'workspace-1')
    expect(component.bindingFor(connectorDefinition)).toEqual(personalBinding)
    fixture.destroy()
  })

  it('lets a workspace manager create a personal binding explicitly', async () => {
    const { component, connectorService, fixture } = await setup()
    component.definitions.set([connectorDefinition])
    component.bindings.set([])
    component.selectMode(connectorDefinition, 'personal')

    await component.createBinding(connectorDefinition)

    expect(connectorService.createBinding).toHaveBeenCalledWith({
      scope: workspaceScope,
      provider: 'example',
      authorizationMode: 'personal'
    })
    fixture.destroy()
  })

  it('keeps providers without an authorizationModes declaration shared-only', async () => {
    const { component, connectorService, fixture } = await setup({ definitions: [legacyDefinition] })
    component.definitions.set([legacyDefinition])
    component.bindings.set([])

    expect(component.authorizationModesFor(legacyDefinition)).toEqual(['shared'])
    await component.createBinding(legacyDefinition)

    expect(connectorService.createBinding).toHaveBeenCalledWith({
      scope: workspaceScope,
      provider: 'legacy',
      authorizationMode: 'shared'
    })
    fixture.destroy()
  })

  it('lets a workspace member connect and consent only their own personal account', async () => {
    const openSpy = jest.spyOn(window, 'open').mockReturnValue(null)
    const { component, connectorService, fixture } = await setup({ canManage: false, bindings: [personalBinding] })
    component.definitions.set([connectorDefinition])
    component.bindings.set([personalBinding])

    expect(component.canConnect(personalBinding)).toBe(true)
    await component.consent(personalBinding)
    await component.connect(personalBinding, connectorDefinition)

    expect(connectorService.consentToBinding).toHaveBeenCalledWith('personal-binding')
    expect(connectorService.connectBinding).toHaveBeenCalledWith('personal-binding', { authMethodId: 'oauth2' })
    expect(openSpy).toHaveBeenCalledWith('', '_blank')
    fixture.destroy()
  })

  it('keeps OAuth authorization and polling attached to the selected binding', async () => {
    const { popup, navigate, focus } = createAuthorizationPopup()
    const openSpy = jest.spyOn(window, 'open').mockReturnValue(popup)
    const pendingPersonalBinding = { ...personalBinding, status: 'pending' as const }
    const { component, connectorService, fixture } = await setup({
      canManage: false,
      bindings: [personalBinding],
      connectResponse: {
        status: 'pending',
        connector: pendingPersonalBinding,
        authorizationUrl: 'https://accounts.example.com/oauth/start',
        stateExpiresAt: '2026-01-01T00:00:00.000Z',
        pollIntervalSeconds: 5
      }
    })
    component.definitions.set([connectorDefinition])
    component.bindings.set([personalBinding])

    await component.connect(personalBinding, connectorDefinition)

    expect(connectorService.connectBinding).toHaveBeenCalledWith('personal-binding', { authMethodId: 'oauth2' })
    expect(component.pendingAuthorizationUrl(pendingPersonalBinding)).toBe('https://accounts.example.com/oauth/start')
    expect(openSpy).toHaveBeenCalledWith('', '_blank')
    expect(navigate).toHaveBeenCalledWith('https://accounts.example.com/oauth/start')
    expect(focus).toHaveBeenCalled()
    expect(popup.opener).toBeNull()
    fixture.destroy()
  })

  it('keeps shared credential management restricted to workspace managers', async () => {
    const { component, connectorService, fixture } = await setup({ canManage: false, bindings: [sharedBinding] })
    component.definitions.set([connectorDefinition])
    component.bindings.set([sharedBinding])
    fixture.detectChanges()

    await component.connect(sharedBinding, connectorDefinition)
    await component.deleteBinding(sharedBinding)

    expect(component.canConnect(sharedBinding)).toBe(false)
    expect(connectorService.connectBinding).not.toHaveBeenCalled()
    expect(connectorService.deleteBinding).not.toHaveBeenCalled()
    const host = fixture.nativeElement as HTMLElement
    expect(host.textContent).toContain('XP.Xpert.ConnectorSharedManagedByManager')
    expect(host.querySelector('[data-connector-action="delete"]')).toBeNull()
    fixture.destroy()
  })

  it('lets a workspace manager rotate an active shared credential without changing the binding mode', async () => {
    jest.spyOn(window, 'open').mockReturnValue(null)
    const { component, connectorService, fixture } = await setup({ bindings: [sharedBinding] })
    component.definitions.set([connectorDefinition])
    component.bindings.set([sharedBinding])

    await component.connect(sharedBinding, connectorDefinition)

    expect(connectorService.connectBinding).toHaveBeenCalledWith('shared-binding', { authMethodId: 'oauth2' })
    expect(connectorService.createBinding).not.toHaveBeenCalled()
    fixture.destroy()
  })

  it('uses provider credential forms with the generic binding connect endpoint', async () => {
    const openSpy = jest.spyOn(window, 'open')
    const { component, connectorService, fixture, toastr } = await setup({
      definitions: [githubDefinition],
      bindings: [githubBinding],
      connectResponse: {
        status: 'active',
        connector: { ...githubBinding, status: 'active' }
      }
    })
    component.definitions.set([githubDefinition])
    component.bindings.set([githubBinding])
    const form = component.formFor(githubBinding, githubDefinition)

    await component.connect(githubBinding, githubDefinition)
    expect(form.controls.token.touched).toBe(true)
    expect(connectorService.connectBinding).not.toHaveBeenCalled()
    expect(toastr.error).toHaveBeenCalledWith('XP.Xpert.ConnectorCredentialsRequired', 'XP.TOASTR.TITLE.ERROR', {
      Default: 'Complete the required authentication fields before connecting.'
    })

    form.controls.token.setValue('github_pat_test')
    await component.connect(githubBinding, githubDefinition)

    expect(connectorService.connectBinding).toHaveBeenCalledWith('github-binding', {
      authMethodId: 'pat',
      values: { token: 'github_pat_test' }
    })
    expect(openSpy).not.toHaveBeenCalled()
    fixture.destroy()
  })
})

describe('ClawXpertConnectorsComponent', () => {
  afterEach(() => TestBed.resetTestingModule())

  it('renders the workspace connector component without binding child state on the wrapper', async () => {
    TestBed.resetTestingModule()
    await TestBed.configureTestingModule({
      imports: [ClawXpertConnectorsComponent]
    })
      .overrideComponent(ClawXpertConnectorsComponent, {
        set: { imports: [StubXpertConnectorsComponent] }
      })
      .compileComponents()

    const fixture = TestBed.createComponent(ClawXpertConnectorsComponent)
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelector('xpert-connectors')).not.toBeNull()
    fixture.destroy()
  })
})
