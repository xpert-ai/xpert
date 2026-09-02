import { Clipboard } from '@angular/cdk/clipboard'
import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import type {
  ConnectorBinding,
  ConnectorConnectResponse,
  ConnectorOAuthStatusResponse,
  ConnectorStrategyDefinition
} from '@xpert-ai/plugin-sdk'
import { TranslateModule } from '@ngx-translate/core'
import { of, throwError } from 'rxjs'
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

const embeddedDefinition: ConnectorStrategyDefinition = {
  provider: 'wecom',
  label: 'WeCom',
  description: 'Connect WeCom with a QR code',
  authorizationModes: ['personal', 'shared'],
  authMethods: [
    {
      id: 'wecom-qr',
      type: 'oauth2',
      label: 'WeCom QR',
      authorizationPresentation: {
        mode: 'embedded_qr',
        title: 'Scan to authorize',
        description: 'Use WeCom to scan this QR code.',
        ariaLabel: 'WeCom authorization QR code',
        completionHint: 'This window closes after authorization.',
        cancelLabel: 'Cancel authorization',
        copyLinkLabel: 'Copy authorization link',
        copyLinkError: 'Could not copy authorization link.'
      }
    }
  ]
}

const workspaceBinding: ConnectorBinding = {
  id: 'workspace-binding',
  workspaceId: 'workspace-1',
  scopeType: 'workspace',
  scope: workspaceScope,
  authorizationMode: 'shared',
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
  authorizationMode: 'shared',
  provider: 'github',
  authMethodId: 'pat',
  status: 'disconnected'
}

const embeddedBinding: ConnectorBinding = {
  id: 'wecom-binding',
  workspaceId: 'workspace-1',
  scopeType: 'workspace',
  scope: workspaceScope,
  authorizationMode: 'shared',
  provider: 'wecom',
  authMethodId: 'wecom-qr',
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
  return { popup, navigate, focus, close }
}

async function setup(options?: {
  canManage?: boolean
  definitions?: ConnectorStrategyDefinition[]
  bindings?: ConnectorBinding[]
  connectResponse?: ConnectorConnectResponse
  pollResponse?: ConnectorOAuthStatusResponse
}) {
  const workspace = signal({ id: 'workspace-1' })
  const connectorSearchQuery = signal('')
  const connectorService = {
    scopedDefinitions: jest.fn(() => of(options?.definitions ?? [connectorDefinition])),
    listBindings: jest.fn(() => of(options?.bindings ?? [])),
    connect: jest.fn(() =>
      of(
        options?.connectResponse ?? {
          status: 'active',
          connector: { ...workspaceBinding, status: 'active', profile: { name: 'Connected Account' } }
        }
      )
    ),
    disconnect: jest.fn(() => of(null)),
    connectBinding: jest.fn(() =>
      of(
        options?.connectResponse ?? {
          status: 'active',
          connector: { ...workspaceBinding, status: 'active', profile: { name: 'Connected Account' } }
        }
      )
    ),
    bindingAuthorizationStatus: jest.fn(() =>
      of(
        options?.pollResponse ?? {
          connector: { ...workspaceBinding, status: 'active' },
          granted: true
        }
      )
    ),
    cancelBindingAuthorization: jest.fn(() => of(null))
  }
  const toastr = {
    success: jest.fn(),
    error: jest.fn()
  }
  const clipboard = {
    copy: jest.fn(() => true)
  }

  if (typeof URL.createObjectURL !== 'function') {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: jest.fn(() => 'blob:qrcode')
    })
  }

  TestBed.resetTestingModule()
  await TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot(), XpertConnectorsComponent],
    providers: [
      {
        provide: XpertWorkspaceHomeComponent,
        useValue: { workspace, connectorSearchQuery }
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
      },
      {
        provide: Clipboard,
        useValue: clipboard
      }
    ]
  }).compileComponents()

  const fixture = TestBed.createComponent(XpertConnectorsComponent)
  fixture.detectChanges()
  await fixture.whenStable()

  return { fixture, component: fixture.componentInstance, connectorService, toastr, clipboard, connectorSearchQuery }
}

describe('XpertConnectorsComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('loads workspace definitions and bindings through the scope-aware APIs', async () => {
    const { component, connectorService, fixture } = await setup({ bindings: [workspaceBinding] })

    await component.load('workspace-1')

    expect(connectorService.scopedDefinitions).toHaveBeenCalledWith('workspace', 'workspace-1')
    expect(connectorService.listBindings).toHaveBeenCalledWith('workspace', 'workspace-1')
    expect(component.bindingFor(connectorDefinition)).toEqual(workspaceBinding)
    fixture.destroy()
  })

  it('connects an unconfigured Workspace connector in one action without enable or delete controls', async () => {
    jest.spyOn(window, 'open').mockReturnValue(null)
    const { component, connectorService, fixture } = await setup({ definitions: [connectorDefinition] })
    component.openConnectorDialog(connectorDefinition)
    fixture.detectChanges()

    const host = fixture.nativeElement as HTMLElement
    const connectButton = host.querySelector<HTMLButtonElement>('[data-connector-action="connect"]')
    const text = host.textContent
    expect(connectButton).not.toBeNull()
    expect(host.querySelector('[data-connector-action="create"]')).toBeNull()
    expect(host.querySelector('[data-connector-action="delete"]')).toBeNull()
    expect(text).not.toContain('XP.Xpert.ConnectorEnable')
    expect(text).not.toContain('XP.Xpert.ConnectorAuthorizationMode')
    expect(text).not.toContain('XP.Xpert.ConnectorPersonalAuthorization')
    expect(text).not.toContain('XP.Xpert.ConnectorSharedAuthorization')

    connectButton?.click()
    await fixture.whenStable()

    expect(connectorService.connect).toHaveBeenCalledWith('workspace-1', 'example', { authMethodId: 'oauth2' })
    expect(component.bindingFor(connectorDefinition)?.status).toBe('active')
    fixture.destroy()
  })

  it('keeps providers without an authorizationModes declaration shared-only', async () => {
    jest.spyOn(window, 'open').mockReturnValue(null)
    const { component, connectorService, fixture } = await setup({
      definitions: [legacyDefinition],
      connectResponse: {
        status: 'active',
        connector: { ...workspaceBinding, provider: 'legacy', status: 'active' }
      }
    })
    component.definitions.set([legacyDefinition])
    component.bindings.set([])
    connectorService.listBindings.mockReturnValueOnce(
      of([{ ...workspaceBinding, provider: 'legacy', status: 'active' as const }])
    )

    await component.connect(null, legacyDefinition)

    expect(connectorService.connect).toHaveBeenCalledWith('workspace-1', 'legacy', { authMethodId: 'oauth2' })
    expect(component.bindingFor(legacyDefinition)?.authorizationMode).toBe('shared')

    component.openConnectorDialog(legacyDefinition)
    fixture.detectChanges()
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('XP.Xpert.ConnectorAuthorizationMode')
    fixture.destroy()
  })

  it('does not expose authorization modes in Workspace when a provider supports multiple Project modes', async () => {
    const { component, fixture } = await setup({ definitions: [connectorDefinition] })

    component.openConnectorDialog(connectorDefinition)
    fixture.detectChanges()

    const text = (fixture.nativeElement as HTMLElement).textContent
    expect(text).not.toContain('XP.Xpert.ConnectorAuthorizationMode')
    expect(text).not.toContain('XP.Xpert.ConnectorPersonalAuthorization')
    expect(text).not.toContain('XP.Xpert.ConnectorSharedAuthorization')
    fixture.destroy()
  })

  it('keeps authorization mode presentation hidden for an existing Workspace binding', async () => {
    const { component, fixture } = await setup({
      definitions: [connectorDefinition],
      bindings: [workspaceBinding]
    })
    component.openConnectorDialog(connectorDefinition)
    fixture.detectChanges()

    const host = fixture.nativeElement as HTMLElement
    const connectButton = host.querySelector<HTMLButtonElement>('[data-connector-action="connect"]')
    expect(host.textContent).not.toContain('XP.Xpert.ConnectorAuthorizationMode')
    expect(host.textContent).not.toContain('XP.Xpert.ConnectorSharedAuthorization')
    expect(connectButton?.textContent).toContain('XP.Xpert.ConnectorConnect')
    expect(connectButton?.textContent).not.toContain('XP.Xpert.ConnectorConnectSharedAccount')
    fixture.destroy()
  })

  it('keeps OAuth authorization and polling attached to the selected binding', async () => {
    const { popup, navigate, focus } = createAuthorizationPopup()
    const openSpy = jest.spyOn(window, 'open').mockReturnValue(popup)
    const pendingWorkspaceBinding = { ...workspaceBinding, status: 'pending' as const }
    const { component, connectorService, fixture } = await setup({
      bindings: [workspaceBinding],
      connectResponse: {
        status: 'pending',
        connector: pendingWorkspaceBinding,
        authorizationUrl: 'https://accounts.example.com/oauth/start',
        stateExpiresAt: '2026-01-01T00:00:00.000Z',
        pollIntervalSeconds: 5
      }
    })
    component.definitions.set([connectorDefinition])
    component.bindings.set([workspaceBinding])

    await component.connect(workspaceBinding, connectorDefinition)

    expect(connectorService.connectBinding).toHaveBeenCalledWith('workspace-binding', { authMethodId: 'oauth2' })
    expect(component.pendingAuthorizationUrl(pendingWorkspaceBinding)).toBe('https://accounts.example.com/oauth/start')
    expect(openSpy).toHaveBeenCalledWith('', '_blank')
    expect(navigate).toHaveBeenCalledWith('https://accounts.example.com/oauth/start')
    expect(focus).toHaveBeenCalled()
    expect(popup.opener).toBeNull()
    fixture.destroy()
  })

  it('recovers pending authorization without opening a popup from polling', async () => {
    const openSpy = jest.spyOn(window, 'open').mockReturnValue(null)
    const pendingBinding = { ...workspaceBinding, status: 'pending' as const }
    const { component, connectorService, fixture } = await setup({
      bindings: [],
      pollResponse: {
        connector: pendingBinding,
        authorizationUrl: 'https://accounts.example.com/oauth/start',
        stateExpiresAt: '2026-01-01T00:00:00.000Z',
        pollIntervalSeconds: 5
      }
    })
    connectorService.listBindings.mockReturnValueOnce(of([pendingBinding]))

    await component.load('workspace-1')

    expect(connectorService.bindingAuthorizationStatus).toHaveBeenCalledWith('workspace-binding')
    expect(component.pendingAuthorizationUrl(pendingBinding)).toBe('https://accounts.example.com/oauth/start')
    expect(openSpy).not.toHaveBeenCalled()
    fixture.destroy()
  })

  it("does not close another binding's OAuth popup when embedded authorization is cancelled", async () => {
    const { popup, close } = createAuthorizationPopup()
    jest.spyOn(window, 'open').mockReturnValue(popup)
    const pendingWorkspaceBinding = { ...workspaceBinding, status: 'pending' as const }
    const pendingEmbeddedBinding = { ...embeddedBinding, status: 'pending' as const }
    const { component, connectorService, fixture } = await setup({
      definitions: [connectorDefinition, embeddedDefinition],
      bindings: [workspaceBinding, embeddedBinding],
      connectResponse: {
        status: 'pending',
        connector: pendingWorkspaceBinding,
        authorizationUrl: 'https://accounts.example.com/oauth/start',
        stateExpiresAt: '2026-01-01T00:00:00.000Z',
        pollIntervalSeconds: 5
      }
    })

    await component.connect(workspaceBinding, connectorDefinition)
    await component.cancelAuthorization(pendingEmbeddedBinding)

    expect(connectorService.cancelBindingAuthorization).toHaveBeenCalledWith('wecom-binding')
    expect(close).not.toHaveBeenCalled()
    fixture.destroy()
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('restores the compact connector catalog and opens binding controls in a dialog', async () => {
    const { fixture, component, connectorSearchQuery } = await setup({
      definitions: [githubDefinition, embeddedDefinition],
      bindings: [githubBinding, embeddedBinding]
    })
    fixture.detectChanges()

    const host = fixture.nativeElement as HTMLElement
    const refreshSpy = jest.spyOn(component, 'refresh').mockImplementation()
    host.querySelector<HTMLButtonElement>('[data-connector-action="refresh"]')?.click()
    expect(refreshSpy).toHaveBeenCalledTimes(1)
    expect(host.querySelector('[data-connector-provider="wecom"]')).not.toBeNull()
    connectorSearchQuery.set('github')
    fixture.detectChanges()
    expect(host.querySelector('[data-connector-provider="wecom"]')).toBeNull()
    const card = host.querySelector<HTMLElement>('[data-connector-provider="github"]')
    expect(card).not.toBeNull()

    card?.querySelector<HTMLButtonElement>('[data-connector-action="open-details"]')?.click()
    fixture.detectChanges()

    expect(host.querySelector('[data-connector-dialog]')).not.toBeNull()
    expect(host.querySelector('[data-connector-action="connect"]')).not.toBeNull()
    expect(host.querySelector('[data-credential-field="token"]')).not.toBeNull()
    fixture.destroy()
  })

  it('uses an auto-filling connector grid that follows the available width', async () => {
    const { fixture } = await setup({ definitions: [connectorDefinition, githubDefinition] })
    fixture.detectChanges()

    const grid = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('[data-connector-grid]')
    expect(grid?.classList).toContain('grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))]')
    fixture.destroy()
  })

  it('shows an icon-only disconnect action on an active connector card', async () => {
    const { connectorService, fixture } = await setup({ bindings: [sharedBinding] })
    fixture.detectChanges()

    const host = fixture.nativeElement as HTMLElement
    const disconnectButton = host.querySelector<HTMLButtonElement>(
      '[data-connector-provider="example"] [data-connector-action="disconnect"]'
    )
    expect(disconnectButton).not.toBeNull()
    expect(disconnectButton?.textContent?.trim()).toBe('')

    disconnectButton?.click()
    await fixture.whenStable()

    expect(connectorService.disconnect).toHaveBeenCalledWith('workspace-1', 'shared-binding')
    fixture.destroy()
  })

  it('does not expose binding removal in the pending QR dialog', async () => {
    const pendingBinding = { ...embeddedBinding, status: 'pending' as const }
    const { component, fixture } = await setup({
      definitions: [embeddedDefinition],
      bindings: [pendingBinding],
      pollResponse: {
        connector: pendingBinding,
        authorizationUrl: 'https://accounts.example.com/wecom/device',
        stateExpiresAt: '2026-01-01T00:00:00.000Z',
        pollIntervalSeconds: 5
      }
    })
    await component.load('workspace-1')
    component.openConnectorDialog(embeddedDefinition)
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelector('[data-connector-action="delete"]')).toBeNull()
    expect(fixture.nativeElement.querySelector('[data-connector-action="cancel-authorization"]')).not.toBeNull()
    expect(fixture.nativeElement.querySelector('[data-connector-action="copy-authorization-url"]')).not.toBeNull()
    fixture.destroy()
  })

  it('copies and cancels the exact embedded binding authorization', async () => {
    const pendingBinding = { ...embeddedBinding, status: 'pending' as const }
    const { component, connectorService, clipboard, fixture } = await setup({
      definitions: [embeddedDefinition],
      bindings: [pendingBinding],
      pollResponse: {
        connector: pendingBinding,
        authorizationUrl: 'https://accounts.example.com/wecom/device',
        stateExpiresAt: '2026-01-01T00:00:00.000Z',
        pollIntervalSeconds: 5
      }
    })
    await component.load('workspace-1')
    component.openConnectorDialog(embeddedDefinition)
    fixture.detectChanges()
    const presentation = embeddedDefinition.authMethods?.[0].authorizationPresentation
    expect(presentation).toBeDefined()
    connectorService.listBindings.mockReturnValueOnce(of([{ ...pendingBinding, status: 'disconnected' }]))

    component.copyPendingAuthorizationUrl(pendingBinding, presentation!)
    await component.cancelAuthorization(pendingBinding)

    expect(clipboard.copy).toHaveBeenCalledWith('https://accounts.example.com/wecom/device')
    expect(connectorService.cancelBindingAuthorization).toHaveBeenCalledWith('wecom-binding')
    expect(component.pendingAuthorizationUrl(pendingBinding)).toBeFalsy()
    expect(component.selectedProvider()).toBeNull()
    fixture.destroy()
  })

  it('keeps the retry URL when scoped authorization cancellation fails', async () => {
    const pendingBinding = { ...embeddedBinding, status: 'pending' as const }
    const { component, connectorService, fixture, toastr } = await setup({
      definitions: [embeddedDefinition],
      bindings: [pendingBinding],
      pollResponse: {
        connector: pendingBinding,
        authorizationUrl: 'https://accounts.example.com/wecom/device',
        stateExpiresAt: '2026-01-01T00:00:00.000Z',
        pollIntervalSeconds: 5
      }
    })
    await component.load('workspace-1')
    connectorService.cancelBindingAuthorization.mockReturnValueOnce(throwError(() => new Error('cancel failed')))

    await component.cancelAuthorization(pendingBinding)

    expect(component.pendingAuthorizationUrl(pendingBinding)).toBe('https://accounts.example.com/wecom/device')
    expect(toastr.error).toHaveBeenCalledWith('cancel failed')
    fixture.destroy()
  })

  it('keeps embedded authorization inside the restored dialog', async () => {
    const openSpy = jest.spyOn(window, 'open')
    const pendingBinding = { ...embeddedBinding, status: 'pending' as const }
    const { component, fixture } = await setup({
      definitions: [embeddedDefinition],
      bindings: [embeddedBinding],
      connectResponse: {
        status: 'pending',
        connector: pendingBinding,
        authorizationUrl: 'https://accounts.example.com/wecom/device',
        stateExpiresAt: '2026-01-01T00:00:00.000Z',
        pollIntervalSeconds: 5
      }
    })
    fixture.detectChanges()

    const host = fixture.nativeElement as HTMLElement
    host
      .querySelector<HTMLButtonElement>('[data-connector-provider="wecom"] [data-connector-action="open-details"]')
      ?.click()
    await component.connect(embeddedBinding, embeddedDefinition)
    fixture.detectChanges()

    expect(openSpy).not.toHaveBeenCalled()
    expect(host.querySelector('[data-connector-authorization-qr]')).not.toBeNull()
    expect(host.querySelector('[data-connector-action="cancel-authorization"]')).not.toBeNull()
    expect(host.querySelector('[data-connector-action="copy-authorization-url"]')).not.toBeNull()
    fixture.destroy()
  })

  it('keeps shared credential management restricted to workspace managers', async () => {
    const { component, connectorService, fixture } = await setup({ canManage: false, bindings: [sharedBinding] })
    component.definitions.set([connectorDefinition])
    component.bindings.set([sharedBinding])
    component.openConnectorDialog(connectorDefinition)
    fixture.detectChanges()

    await component.connect(sharedBinding, connectorDefinition)
    await component.disconnect(sharedBinding)

    expect(connectorService.connectBinding).not.toHaveBeenCalled()
    expect(connectorService.disconnect).not.toHaveBeenCalled()
    const host = fixture.nativeElement as HTMLElement
    expect(host.textContent).not.toContain('XP.Xpert.ConnectorAuthorizationMode')
    expect(host.textContent).not.toContain('XP.Xpert.ConnectorSharedAuthorization')
    expect(host.textContent).toContain('XP.Xpert.ConnectorsReadonly')
    expect(host.querySelector('[data-connector-action="delete"]')).toBeNull()
    fixture.destroy()
  })

  it('shows only disconnect for an active Workspace connector', async () => {
    const { component, connectorService, fixture } = await setup({ bindings: [sharedBinding] })
    component.definitions.set([connectorDefinition])
    component.bindings.set([sharedBinding])
    component.openConnectorDialog(connectorDefinition)
    fixture.detectChanges()

    const host = fixture.nativeElement as HTMLElement
    const disconnectButton = host.querySelector<HTMLButtonElement>('[data-connector-action="disconnect"]')
    expect(disconnectButton).not.toBeNull()
    expect(host.querySelector('[data-connector-action="connect"]')).toBeNull()
    expect(host.querySelector('[data-connector-action="delete"]')).toBeNull()

    disconnectButton?.click()
    await fixture.whenStable()

    expect(connectorService.disconnect).toHaveBeenCalledWith('workspace-1', 'shared-binding')
    fixture.destroy()
  })

  it('keeps a disconnected Workspace connector available for reconnect without delete controls', async () => {
    const { component, fixture } = await setup({ bindings: [workspaceBinding] })
    component.definitions.set([connectorDefinition])
    component.bindings.set([workspaceBinding])
    component.openConnectorDialog(connectorDefinition)
    fixture.detectChanges()

    const host = fixture.nativeElement as HTMLElement
    expect(host.querySelector('[data-connector-action="connect"]')).not.toBeNull()
    expect(host.querySelector('[data-connector-action="delete"]')).toBeNull()
    fixture.destroy()
  })

  it('connects directly from the card plus button when no credentials are required', async () => {
    jest.spyOn(window, 'open').mockReturnValue(null)
    const { component, connectorService, fixture } = await setup({ definitions: [connectorDefinition] })
    fixture.detectChanges()

    const host = fixture.nativeElement as HTMLElement
    host
      .querySelector<HTMLButtonElement>('[data-connector-provider="example"] [data-connector-action="quick-connect"]')
      ?.click()
    await fixture.whenStable()

    expect(connectorService.connect).toHaveBeenCalledWith('workspace-1', 'example', { authMethodId: 'oauth2' })
    expect(component.selectedProvider()).toBeNull()
    expect(component.bindingFor(connectorDefinition)?.status).toBe('active')
    fixture.destroy()
  })

  it('opens the dialog from the card plus button when required credentials are missing', async () => {
    const { component, connectorService, fixture } = await setup({ definitions: [githubDefinition] })
    fixture.detectChanges()

    const host = fixture.nativeElement as HTMLElement
    host
      .querySelector<HTMLButtonElement>('[data-connector-provider="github"] [data-connector-action="quick-connect"]')
      ?.click()
    fixture.detectChanges()

    expect(component.selectedProvider()).toBe('github')
    expect(host.querySelector('[data-connector-dialog]')).not.toBeNull()
    expect(connectorService.connect).not.toHaveBeenCalled()
    fixture.destroy()
  })

  it('shows provider credential forms before the first connection and connects without enable', async () => {
    const openSpy = jest.spyOn(window, 'open')
    const { component, connectorService, fixture, toastr } = await setup({
      definitions: [githubDefinition],
      bindings: [],
      connectResponse: {
        status: 'active',
        connector: { ...githubBinding, status: 'active' }
      }
    })
    component.definitions.set([githubDefinition])
    component.bindings.set([])
    component.openConnectorDialog(githubDefinition)
    component.selectAuthMethod(null, githubDefinition, 'pat')
    fixture.detectChanges()
    const form = component.formFor(null, githubDefinition)

    expect(fixture.nativeElement.querySelector('[data-credential-field="token"]')).not.toBeNull()

    await component.connect(null, githubDefinition)
    expect(form.controls.token.touched).toBe(true)
    expect(connectorService.connect).not.toHaveBeenCalled()
    expect(toastr.error).toHaveBeenCalledWith('XP.Xpert.ConnectorCredentialsRequired', 'XP.TOASTR.TITLE.ERROR', {
      Default: 'Complete the required authentication fields before connecting.'
    })

    form.controls.token.setValue('github_pat_test')
    await component.connect(null, githubDefinition)

    expect(connectorService.connect).toHaveBeenCalledWith('workspace-1', 'github', {
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
