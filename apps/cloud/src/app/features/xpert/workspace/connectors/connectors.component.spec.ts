import { OverlayContainer } from '@angular/cdk/overlay'
import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import type {
  ConnectorConnectResponse,
  ConnectorInstance,
  ConnectorOAuthStatusResponse,
  ConnectorStrategyDefinition
} from '@xpert-ai/plugin-sdk'
import { TranslateModule } from '@ngx-translate/core'
import { of } from 'rxjs'
import { ToastrService, XpertConnectorService, XpertWorkspaceService } from 'apps/cloud/src/app/@core'
import { XpertWorkspaceHomeComponent } from '../home/home.component'
import { XpertConnectorsComponent } from './connectors.component'

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

const pendingConnector: ConnectorInstance = {
  id: 'connector-1',
  workspaceId: 'workspace-1',
  provider: 'example',
  status: 'pending'
}

const activeConnector: ConnectorInstance = {
  ...pendingConnector,
  status: 'active',
  profile: {
    name: 'Example User'
  }
}

const connectorDefinition: ConnectorStrategyDefinition = {
  provider: 'example',
  label: 'Example Connector',
  description: 'Connect an external workspace service',
  auth: {
    type: 'oauth2',
    authorizationUrl: '',
    tokenUrl: ''
  }
}

const githubDefinition: ConnectorStrategyDefinition = {
  provider: 'github',
  label: 'GitHub',
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

type TestableConnectorsComponent = XpertConnectorsComponent & {
  pollAuthorization(workspaceId: string, connectorId: string): Promise<void>
}

function dispatchPointerDown(element: Element) {
  if (typeof PointerEvent === 'function') {
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }))
  }
}

function dispatchMouseDown(element: Element) {
  element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, composed: true }))
}

function createAuthorizationPopup() {
  const navigate = jest.fn()
  const focus = jest.fn()
  const location = {}
  Object.defineProperty(location, 'href', { set: navigate })
  const popup = {
    opener: window,
    closed: false,
    focus,
    location
  } as unknown as Window
  return { popup, navigate, focus }
}

async function setup(options?: {
  workspaceId?: string
  definitions?: ConnectorStrategyDefinition[]
  connectors?: ConnectorInstance[]
  connectResponse?: ConnectorConnectResponse
  pollResponse?: ConnectorOAuthStatusResponse
}) {
  const workspace = signal<{ id: string } | null>(options?.workspaceId ? { id: options.workspaceId } : null)
  const pollResponse = options?.pollResponse ?? {
    connector: pendingConnector,
    authorizationUrl: 'https://accounts.example.com/oauth/continue',
    pollIntervalSeconds: 5
  }
  const connectorService = {
    definitions: jest.fn(() => of(options?.definitions ?? [connectorDefinition])),
    list: jest.fn(() => of(options?.connectors ?? [pendingConnector])),
    pollAuthorization: jest.fn(() => of(pollResponse)),
    connect: jest.fn(() => of(options?.connectResponse)),
    disconnect: jest.fn(() => of(null))
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
        useValue: {
          workspace
        }
      },
      {
        provide: XpertConnectorService,
        useValue: connectorService
      },
      {
        provide: XpertWorkspaceService,
        useValue: {
          canManage: jest.fn(() => true)
        }
      },
      {
        provide: ToastrService,
        useValue: toastr
      }
    ]
  }).compileComponents()

  const fixture = TestBed.createComponent(XpertConnectorsComponent)
  fixture.detectChanges()

  return {
    fixture,
    component: fixture.componentInstance,
    connectorService,
    toastr,
    workspace
  }
}

describe('XpertConnectorsComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('recovers a pending authorization URL when loading existing pending connectors', async () => {
    const { popup, navigate } = createAuthorizationPopup()
    const openSpy = jest.spyOn(window, 'open').mockReturnValue(popup)
    const { component, connectorService, fixture } = await setup()

    await component.load('workspace-1')

    expect(connectorService.pollAuthorization).toHaveBeenCalledWith('workspace-1', 'connector-1')
    expect(component.pendingAuthorizationUrl(pendingConnector)).toBe('https://accounts.example.com/oauth/continue')
    expect(openSpy).toHaveBeenCalledWith('', '_blank')
    expect(navigate).toHaveBeenCalledWith('https://accounts.example.com/oauth/continue')

    fixture.destroy()
  })

  it('opens connector authorization in a new window when connecting', async () => {
    const { popup, navigate } = createAuthorizationPopup()
    const openSpy = jest.spyOn(window, 'open').mockReturnValue(popup)
    const { component, connectorService, fixture, workspace } = await setup({
      connectResponse: {
        status: 'pending',
        connector: pendingConnector,
        authorizationUrl: 'https://accounts.example.com/oauth/start',
        stateExpiresAt: '2026-01-01T00:00:00.000Z',
        pollIntervalSeconds: 5
      }
    })

    workspace.set({ id: 'workspace-1' })
    await component.connect(connectorDefinition)

    expect(connectorService.connect).toHaveBeenCalledWith('workspace-1', 'example', {
      authMethodId: 'oauth2'
    })
    expect(openSpy).toHaveBeenCalledWith('', '_blank')
    expect(navigate).toHaveBeenCalledWith('https://accounts.example.com/oauth/start')
    expect(popup.opener).toBeNull()

    fixture.destroy()
  })

  it('does not replace the current page when the authorization popup is blocked', async () => {
    const openSpy = jest.spyOn(window, 'open').mockReturnValue(null)
    const { component, fixture, toastr, workspace } = await setup({
      connectResponse: {
        status: 'pending',
        connector: pendingConnector,
        authorizationUrl: 'https://accounts.example.com/oauth/start',
        stateExpiresAt: '2026-01-01T00:00:00.000Z',
        pollIntervalSeconds: 5
      }
    })

    workspace.set({ id: 'workspace-1' })
    await component.connect(connectorDefinition)

    expect(openSpy).toHaveBeenCalledWith('', '_blank')
    expect(toastr.error).toHaveBeenCalledWith(
      'PAC.Xpert.ConnectorAuthorizationPopupBlocked',
      'PAC.TOASTR.TITLE.ERROR',
      {
        Default: 'Authorization page was blocked. Allow pop-ups for this site and try again.'
      }
    )

    fixture.destroy()
  })

  it('does not start a new authorization flow for an active connector', async () => {
    const openSpy = jest.spyOn(window, 'open')
    const { component, connectorService, fixture, workspace } = await setup({
      connectors: [activeConnector]
    })

    workspace.set({ id: 'workspace-1' })
    component.connectors.set([activeConnector])
    await component.connect(connectorDefinition)

    expect(connectorService.connect).not.toHaveBeenCalled()
    expect(openSpy).not.toHaveBeenCalled()

    fixture.destroy()
  })

  it('renders active connectors without description, profile text, or disconnect label', async () => {
    const { component, fixture, workspace } = await setup({
      connectors: [activeConnector]
    })

    workspace.set({ id: 'workspace-1' })
    component.definitions.set([connectorDefinition])
    component.connectors.set([activeConnector])
    fixture.detectChanges()

    const host = fixture.nativeElement as HTMLElement
    expect(host.textContent).not.toContain('Connect an external workspace service')
    expect(host.textContent).not.toContain('Example User')
    expect(host.textContent).not.toContain('Disconnect')

    const button = host.querySelector('button')
    expect(button?.textContent?.trim()).toBe('')
    expect(button?.querySelector('lucide-angular')).not.toBeNull()
    expect(host.querySelector('.w-full')).not.toBeNull()
    expect(host.querySelector('.max-w-md')).toBeNull()

    fixture.destroy()
  })

  it('does not refresh the authorization window when polling returns the current URL again', async () => {
    const { popup, navigate, focus } = createAuthorizationPopup()
    const openSpy = jest.spyOn(window, 'open').mockReturnValue(popup)
    const { component, fixture, workspace } = await setup({
      connectResponse: {
        status: 'pending',
        connector: pendingConnector,
        authorizationUrl: 'https://accounts.example.com/oauth/start',
        stateExpiresAt: '2026-01-01T00:00:00.000Z',
        pollIntervalSeconds: 5
      },
      pollResponse: {
        connector: pendingConnector,
        authorizationUrl: 'https://accounts.example.com/oauth/start',
        pollIntervalSeconds: 5
      }
    })

    workspace.set({ id: 'workspace-1' })
    await component.connect(connectorDefinition)
    navigate.mockClear()
    focus.mockClear()
    await (component as unknown as TestableConnectorsComponent).pollAuthorization('workspace-1', 'connector-1')

    expect(openSpy).toHaveBeenCalledTimes(1)
    expect(navigate).not.toHaveBeenCalled()
    expect(focus).not.toHaveBeenCalled()

    fixture.destroy()
  })

  it('reuses the opened authorization window when polling returns a continuation URL', async () => {
    const { popup, navigate } = createAuthorizationPopup()
    const openSpy = jest.spyOn(window, 'open').mockReturnValue(popup)
    const { component, fixture, workspace } = await setup({
      connectResponse: {
        status: 'pending',
        connector: pendingConnector,
        authorizationUrl: 'https://accounts.example.com/oauth/start',
        stateExpiresAt: '2026-01-01T00:00:00.000Z',
        pollIntervalSeconds: 5
      },
      pollResponse: {
        connector: pendingConnector,
        authorizationUrl: 'https://accounts.example.com/oauth/continue',
        pollIntervalSeconds: 5
      }
    })

    workspace.set({ id: 'workspace-1' })
    await component.connect(connectorDefinition)
    await (component as unknown as TestableConnectorsComponent).pollAuthorization('workspace-1', 'connector-1')

    expect(openSpy).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith('https://accounts.example.com/oauth/continue')
    expect(popup.focus).toHaveBeenCalled()

    fixture.destroy()
  })

  it('stops pending authorization polling when the workspace changes', async () => {
    jest.useFakeTimers()
    const { popup } = createAuthorizationPopup()
    jest.spyOn(window, 'open').mockReturnValue(popup)
    const { component, connectorService, fixture, workspace } = await setup({
      connectors: [],
      connectResponse: {
        status: 'pending',
        connector: pendingConnector,
        authorizationUrl: 'https://accounts.example.com/oauth/start',
        stateExpiresAt: '2026-01-01T00:00:00.000Z',
        pollIntervalSeconds: 5
      }
    })

    workspace.set({ id: 'workspace-1' })
    await component.connect(connectorDefinition)
    connectorService.pollAuthorization.mockClear()

    workspace.set({ id: 'workspace-2' })
    fixture.detectChanges()
    jest.advanceTimersByTime(5_000)
    await Promise.resolve()

    expect(connectorService.pollAuthorization).not.toHaveBeenCalled()

    fixture.destroy()
  })

  it('renders provider-defined credential fields and masks secrets', async () => {
    const { component, fixture } = await setup()

    component.definitions.set([githubDefinition])
    component.connectors.set([])
    fixture.detectChanges()

    const host = fixture.nativeElement as HTMLElement
    const clientIdInput = host.querySelector<HTMLInputElement>('input[data-credential-field="clientId"]')
    const clientSecretInput = host.querySelector<HTMLInputElement>('input[data-credential-field="clientSecret"]')

    expect(host.querySelectorAll('z-select')).toHaveLength(1)
    expect(clientIdInput?.type).toBe('text')
    expect(clientIdInput?.autocomplete).toBe('off')
    expect(clientSecretInput?.type).toBe('password')
    expect(clientSecretInput?.autocomplete).toBe('new-password')

    fixture.destroy()
  })

  it('switches authentication methods and removes stale credential controls', async () => {
    const { component, fixture } = await setup()
    const overlayContainer = TestBed.inject(OverlayContainer)

    component.definitions.set([githubDefinition])
    component.connectors.set([])
    fixture.detectChanges()

    const form = component.formFor(githubDefinition)
    form.controls.clientId.setValue('client-id')
    const trigger = fixture.nativeElement.querySelector('z-select button[role="combobox"]') as HTMLButtonElement
    trigger.click()
    fixture.detectChanges()
    await fixture.whenStable()

    const patOption = overlayContainer.getContainerElement().querySelector<HTMLElement>('z-select-item[value="pat"]')
    if (!patOption) {
      throw new Error('Expected PAT authentication option to be rendered')
    }
    dispatchPointerDown(patOption)
    dispatchMouseDown(patOption)
    patOption.click()
    fixture.detectChanges()
    await fixture.whenStable()

    const host = fixture.nativeElement as HTMLElement
    expect(form.controls.clientId).toBeUndefined()
    expect(form.controls.clientSecret).toBeUndefined()
    expect(form.controls.token).toBeDefined()
    expect(host.querySelector('input[data-credential-field="clientId"]')).toBeNull()
    expect(host.querySelector('input[data-credential-field="clientSecret"]')).toBeNull()
    expect(host.querySelector<HTMLInputElement>('input[data-credential-field="token"]')?.type).toBe('password')

    fixture.destroy()
  })

  it('blocks missing credentials and submits a completed PAT form without opening an OAuth popup', async () => {
    const activeGitHubConnector: ConnectorInstance = {
      id: 'github-1',
      workspaceId: 'workspace-1',
      provider: 'github',
      authMethodId: 'pat',
      status: 'active'
    }
    const openSpy = jest.spyOn(window, 'open')
    const { component, connectorService, fixture, toastr } = await setup({
      workspaceId: 'workspace-1',
      definitions: [githubDefinition],
      connectors: [],
      connectResponse: {
        status: 'active',
        connector: activeGitHubConnector
      }
    })

    await fixture.whenStable()
    fixture.detectChanges()
    component.selectAuthMethod(githubDefinition, 'pat')
    fixture.detectChanges()

    const host = fixture.nativeElement as HTMLElement
    const form = component.formFor(githubDefinition)
    const tokenInput = host.querySelector<HTMLInputElement>('input[data-credential-field="token"]')
    expect(host.querySelectorAll('button[aria-label]')).toHaveLength(1)
    const connectButton = host.querySelector<HTMLButtonElement>('button[aria-label]')
    if (!tokenInput || !connectButton) {
      throw new Error('Expected PAT input and connector action to be rendered')
    }

    connectButton.click()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(form.controls.token.touched).toBe(true)
    expect(host.querySelectorAll('z-form-message')).toHaveLength(1)
    expect(connectorService.connect).not.toHaveBeenCalled()
    expect(openSpy).not.toHaveBeenCalled()
    expect(toastr.error).toHaveBeenCalledWith('PAC.Xpert.ConnectorCredentialsRequired', 'PAC.TOASTR.TITLE.ERROR', {
      Default: 'Complete the required authentication fields before connecting.'
    })

    tokenInput.value = 'github_pat_test'
    tokenInput.dispatchEvent(new Event('input', { bubbles: true }))
    fixture.detectChanges()
    connectButton.click()
    await fixture.whenStable()

    expect(connectorService.connect).toHaveBeenCalledWith('workspace-1', 'github', {
      authMethodId: 'pat',
      values: { token: 'github_pat_test' }
    })
    expect(openSpy).not.toHaveBeenCalled()

    fixture.destroy()
  })
})
