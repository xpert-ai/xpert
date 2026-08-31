import { Clipboard } from '@angular/cdk/clipboard'
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
  const { of } = require('rxjs')

  class ToastrService {}
  class XpertConnectorService {}
  class XpertWorkspaceService {}

  return {
    ToastrService,
    XpertConnectorService,
    XpertWorkspaceService,
    injectIntegrationAPI: () => ({
      getProviders: () => of([]),
      getAllInOrg: () => of({ items: [], total: 0 })
    }),
    getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
    injectToastr: () => inject(ToastrService)
  }
})

jest.mock('../home/home.component', () => ({
  XpertWorkspaceHomeComponent: class XpertWorkspaceHomeComponent {}
}))

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

const embeddedQrPendingConnector: ConnectorInstance = {
  id: 'embedded-qr-connector-1',
  workspaceId: 'workspace-1',
  provider: 'embedded-qr',
  authMethodId: 'qr',
  status: 'pending'
}

const secondaryEmbeddedQrPendingConnector: ConnectorInstance = {
  ...embeddedQrPendingConnector,
  id: 'secondary-embedded-qr-connector-1',
  authMethodId: 'secondary-qr'
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

const dingtalkDefinition: ConnectorStrategyDefinition = {
  provider: 'dingtalk',
  label: 'DingTalk',
  authMethods: [
    {
      id: 'oauth2',
      type: 'oauth2',
      label: 'DingTalk OAuth'
    }
  ]
}

const qrPresentation = {
  mode: 'embedded_qr' as const,
  title: 'Connect QR provider',
  description: 'Scan the QR code to complete authorization.',
  ariaLabel: 'Authorization QR code',
  completionHint: 'The dialog will close after authorization.',
  cancelLabel: 'Cancel authorization',
  copyLinkLabel: 'Copy link',
  copyLinkError: 'Could not copy authorization link.'
}

const embeddedQrDefinition: ConnectorStrategyDefinition = {
  provider: 'embedded-qr',
  label: 'Embedded QR',
  description: 'Connect by scanning a QR code.',
  authMethods: [
    {
      id: 'qr',
      type: 'oauth2',
      label: 'QR authorization',
      authorizationPresentation: qrPresentation
    }
  ]
}

const secondaryEmbeddedQrDefinition: ConnectorStrategyDefinition = {
  ...embeddedQrDefinition,
  authMethods: [
    {
      id: 'secondary-qr',
      type: 'oauth2',
      label: 'Secondary QR authorization',
      authorizationPresentation: qrPresentation
    },
    {
      id: 'token',
      type: 'api_key',
      label: 'API token',
      credentials: {
        fields: [{ name: 'token', label: 'Token', type: 'password', required: true, secret: true }]
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
  workspaceId?: string
  definitions?: ConnectorStrategyDefinition[]
  connectors?: ConnectorInstance[]
  connectResponse?: ConnectorConnectResponse
  pollResponse?: ConnectorOAuthStatusResponse
}) {
  const workspace = signal<{ id: string } | null>(options?.workspaceId ? { id: options.workspaceId } : null)
  const connectorSearchQuery = signal('')
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
    disconnect: jest.fn(() => of(null)),
    cancelAuthorization: jest.fn(() => of(null))
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
        useValue: {
          workspace,
          connectorSearchQuery
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
      },
      {
        provide: Clipboard,
        useValue: clipboard
      }
    ]
  }).compileComponents()

  const fixture = TestBed.createComponent(XpertConnectorsComponent)
  fixture.detectChanges()

  return {
    fixture,
    component: fixture.componentInstance,
    connectorService,
    clipboard,
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
    expect(toastr.error).toHaveBeenCalledWith('XP.Xpert.ConnectorAuthorizationPopupBlocked', 'XP.TOASTR.TITLE.ERROR', {
      Default: 'Authorization page was blocked. Allow pop-ups for this site and try again.'
    })

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

  it('opens active connector details with profile text and disconnect action', async () => {
    const { component, fixture, workspace } = await setup({
      connectors: [activeConnector]
    })

    workspace.set({ id: 'workspace-1' })
    component.definitions.set([connectorDefinition])
    component.connectors.set([activeConnector])
    component.openConnectorDialog(connectorDefinition)
    fixture.detectChanges()

    const host = fixture.nativeElement as HTMLElement
    expect(host.textContent).toContain('Connect an external workspace service')
    expect(host.textContent).toContain('Example User')
    expect(host.textContent).toContain('XP.Xpert.ConnectorDisconnect')
    expect(host.querySelector('[data-connector-dialog]')).not.toBeNull()

    const button = host.querySelector('button[data-connector-action="disconnect"]')
    expect(button?.textContent).toContain('XP.Xpert.ConnectorDisconnect')
    expect(button?.querySelector('lucide-angular')).not.toBeNull()

    fixture.destroy()
  })

  it('filters connector cards by provider and translated metadata', async () => {
    const secondDefinition: ConnectorStrategyDefinition = {
      ...connectorDefinition,
      provider: 'calendar',
      label: 'Calendar',
      description: 'Schedule meetings'
    }
    const { component, fixture } = await setup({
      definitions: [connectorDefinition, secondDefinition],
      connectors: []
    })

    component.definitions.set([connectorDefinition, secondDefinition])
    component.searchQuery.set('schedule')
    fixture.detectChanges()

    const host = fixture.nativeElement as HTMLElement
    expect(host.querySelector('[data-connector-provider="example"]')).toBeNull()
    expect(host.querySelector('[data-connector-provider="calendar"]')).not.toBeNull()

    fixture.destroy()
  })

  it('starts an OAuth connector directly from the card quick-connect action', async () => {
    const { component, fixture } = await setup({
      workspaceId: 'workspace-1',
      definitions: [connectorDefinition],
      connectors: []
    })
    const connectSpy = jest.spyOn(component, 'connect').mockResolvedValue()

    await fixture.whenStable()
    component.definitions.set([connectorDefinition])
    component.connectors.set([])
    fixture.detectChanges()

    const button = fixture.nativeElement.querySelector<HTMLButtonElement>(
      'button[data-connector-action="quick-connect"]'
    )
    if (!button) {
      throw new Error('Expected quick-connect action to be rendered')
    }

    button.click()
    await fixture.whenStable()

    expect(connectSpy).toHaveBeenCalledWith(connectorDefinition)
    expect(component.selectedDefinition()).toBeNull()

    fixture.destroy()
  })

  it('opens embedded QR authorization in the current connector dialog without a new window', async () => {
    const authorizationUrl = 'https://auth.example.com/qr/state-1'
    const openSpy = jest.spyOn(window, 'open')
    const { component, connectorService, fixture } = await setup({
      workspaceId: 'workspace-1',
      definitions: [embeddedQrDefinition],
      connectors: [],
      connectResponse: {
        status: 'pending',
        connector: embeddedQrPendingConnector,
        authorizationUrl,
        stateExpiresAt: '2026-01-01T00:00:00.000Z',
        pollIntervalSeconds: 5
      }
    })

    await fixture.whenStable()
    component.definitions.set([embeddedQrDefinition])
    component.connectors.set([])
    fixture.detectChanges()

    const button = fixture.nativeElement.querySelector<HTMLButtonElement>(
      'button[data-connector-action="quick-connect"]'
    )
    if (!button) {
      throw new Error('Expected quick-connect action to be rendered')
    }

    button.click()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(connectorService.connect).toHaveBeenCalledWith('workspace-1', 'embedded-qr', {
      authMethodId: 'qr'
    })
    expect(openSpy).not.toHaveBeenCalled()
    expect(component.selectedDefinition()?.provider).toBe('embedded-qr')
    expect(component.pendingAuthorizationUrl(embeddedQrPendingConnector)).toBe(authorizationUrl)

    const host = fixture.nativeElement as HTMLElement
    expect(host.querySelector('[data-connector-authorization-qr]')).not.toBeNull()
    expect(host.querySelector('qrcode')).not.toBeNull()
    expect(host.querySelector('button[data-connector-action="copy-authorization-url"]')).not.toBeNull()

    fixture.destroy()
  })

  it('opens the current secondary embedded QR authorization in the connector dialog without a new window', async () => {
    const authorizationUrl = 'https://auth.example.com/qr/secondary-state'
    const openSpy = jest.spyOn(window, 'open')
    const { component, connectorService, fixture } = await setup({
      workspaceId: 'workspace-1',
      definitions: [secondaryEmbeddedQrDefinition],
      connectors: [],
      connectResponse: {
        status: 'pending',
        connector: secondaryEmbeddedQrPendingConnector,
        authorizationUrl,
        pollIntervalSeconds: 3
      }
    })

    await fixture.whenStable()
    component.definitions.set([secondaryEmbeddedQrDefinition])
    component.connectors.set([])
    fixture.detectChanges()

    const button = fixture.nativeElement.querySelector<HTMLButtonElement>(
      'button[data-connector-action="quick-connect"]'
    )
    if (!button) {
      throw new Error('Expected quick-connect action to be rendered')
    }

    button.click()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(connectorService.connect).toHaveBeenCalledWith('workspace-1', 'embedded-qr', {
      authMethodId: 'secondary-qr'
    })
    expect(openSpy).not.toHaveBeenCalled()
    expect(component.selectedDefinition()?.provider).toBe('embedded-qr')
    expect(component.pendingAuthorizationUrl(secondaryEmbeddedQrPendingConnector)).toBe(authorizationUrl)
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-connector-authorization-qr]')).not.toBeNull()

    fixture.destroy()
  })

  it('opens credential configuration from quick connect when required fields are present', async () => {
    const { component, fixture } = await setup({
      workspaceId: 'workspace-1',
      definitions: [githubDefinition],
      connectors: []
    })
    const connectSpy = jest.spyOn(component, 'connect').mockResolvedValue()

    await fixture.whenStable()
    component.definitions.set([githubDefinition])
    component.connectors.set([])
    fixture.detectChanges()

    const button = fixture.nativeElement.querySelector<HTMLButtonElement>(
      'button[data-connector-action="quick-connect"]'
    )
    if (!button) {
      throw new Error('Expected quick-connect action to be rendered')
    }

    button.click()
    fixture.detectChanges()

    expect(connectSpy).not.toHaveBeenCalled()
    expect(component.selectedDefinition()?.provider).toBe('github')
    expect(fixture.nativeElement.querySelector('[data-connector-dialog]')).not.toBeNull()

    fixture.destroy()
  })

  it('replaces quick connect with a direct disconnect action for active connectors', async () => {
    const { component, fixture } = await setup({
      workspaceId: 'workspace-1',
      definitions: [connectorDefinition],
      connectors: [activeConnector]
    })
    const disconnectSpy = jest.spyOn(component, 'disconnect').mockResolvedValue()

    await fixture.whenStable()
    component.definitions.set([connectorDefinition])
    component.connectors.set([activeConnector])
    fixture.detectChanges()

    const host = fixture.nativeElement as HTMLElement
    const button = host.querySelector<HTMLButtonElement>('button[data-connector-action="quick-disconnect"]')
    if (!button) {
      throw new Error('Expected quick-disconnect action to be rendered')
    }

    expect(host.querySelector('button[data-connector-action="quick-connect"]')).toBeNull()
    expect(button.textContent?.trim()).toBe('')
    expect(button.getAttribute('aria-label')).toBe('XP.Xpert.ConnectorDisconnect')
    expect(button.querySelector('lucide-angular')).not.toBeNull()

    button.click()
    await fixture.whenStable()

    expect(disconnectSpy).toHaveBeenCalledWith(activeConnector)

    fixture.destroy()
  })

  it('shows pending authorization as a top-right card action', async () => {
    const { component, fixture } = await setup({
      definitions: [connectorDefinition],
      connectors: [pendingConnector]
    })
    const continueSpy = jest.spyOn(component, 'openPendingAuthorizationUrl').mockImplementation()

    component.definitions.set([connectorDefinition])
    component.connectors.set([pendingConnector])
    component.pendingAuthorizationUrls.set({
      [pendingConnector.id]: 'https://accounts.example.com/oauth/continue'
    })
    fixture.detectChanges()

    const host = fixture.nativeElement as HTMLElement
    const button = host.querySelector<HTMLButtonElement>('button[data-connector-action="continue-authorization"]')
    if (!button) {
      throw new Error('Expected continue-authorization action to be rendered')
    }

    expect(host.querySelector('button[data-connector-action="quick-connect"]')).toBeNull()
    expect(button.textContent).toContain('XP.Xpert.ConnectorOpenAuthorization')

    button.click()
    expect(continueSpy).toHaveBeenCalledWith(pendingConnector)

    fixture.destroy()
  })

  it('reopens pending embedded QR authorization in the current dialog from the card action', async () => {
    const openSpy = jest.spyOn(window, 'open')
    const { component, fixture } = await setup({
      definitions: [embeddedQrDefinition],
      connectors: [embeddedQrPendingConnector]
    })

    component.definitions.set([embeddedQrDefinition])
    component.connectors.set([embeddedQrPendingConnector])
    component.pendingAuthorizationUrls.set({
      [embeddedQrPendingConnector.id]: 'https://auth.example.com/qr/state-1'
    })
    fixture.detectChanges()

    const host = fixture.nativeElement as HTMLElement
    const button = host.querySelector<HTMLButtonElement>('button[data-connector-action="continue-authorization"]')
    if (!button) {
      throw new Error('Expected continue-authorization action to be rendered')
    }

    button.click()
    fixture.detectChanges()

    expect(openSpy).not.toHaveBeenCalled()
    expect(component.selectedDefinition()?.provider).toBe('embedded-qr')
    expect(host.querySelector('[data-connector-authorization-qr]')).not.toBeNull()

    fixture.destroy()
  })

  it('copies the embedded QR authorization link from the embedded dialog', async () => {
    const authorizationUrl = 'https://auth.example.com/qr/state-1'
    const { clipboard, component, fixture } = await setup({
      definitions: [embeddedQrDefinition],
      connectors: [embeddedQrPendingConnector]
    })

    component.definitions.set([embeddedQrDefinition])
    component.connectors.set([embeddedQrPendingConnector])
    component.pendingAuthorizationUrls.set({ [embeddedQrPendingConnector.id]: authorizationUrl })
    component.openConnectorDialog(embeddedQrDefinition)
    fixture.detectChanges()

    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      'button[data-connector-action="copy-authorization-url"]'
    )
    if (!button) {
      throw new Error('Expected copy authorization action to be rendered')
    }

    button.click()

    expect(clipboard.copy).toHaveBeenCalledWith(authorizationUrl)

    fixture.destroy()
  })

  it('renders and cancels pending authorization instead of treating it as a disconnect only', async () => {
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
    component.definitions.set([connectorDefinition])
    await component.connect(connectorDefinition)
    component.openConnectorDialog(connectorDefinition)
    fixture.detectChanges()

    const host = fixture.nativeElement as HTMLElement
    expect(host.querySelector('button[data-connector-action="cancel-authorization"]')?.textContent).toContain(
      'XP.ACTIONS.Cancel'
    )

    await component.disconnect(pendingConnector)

    expect(connectorService.cancelAuthorization).toHaveBeenCalledWith('workspace-1', 'connector-1')
    expect(connectorService.disconnect).not.toHaveBeenCalled()
    expect(popup.close).toHaveBeenCalled()
    expect(component.pollingConnectorId()).toBeNull()
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

  it('keeps embedded QR authorization URL changes inside the embedded QR dialog while polling', async () => {
    const openSpy = jest.spyOn(window, 'open')
    const { component, fixture, workspace } = await setup({
      definitions: [embeddedQrDefinition],
      connectors: [],
      connectResponse: {
        status: 'pending',
        connector: embeddedQrPendingConnector,
        authorizationUrl: 'https://auth.example.com/qr/state-1',
        stateExpiresAt: '2026-01-01T00:00:00.000Z',
        pollIntervalSeconds: 5
      },
      pollResponse: {
        connector: embeddedQrPendingConnector,
        authorizationUrl: 'https://auth.example.com/qr/state-2',
        pollIntervalSeconds: 5
      }
    })

    workspace.set({ id: 'workspace-1' })
    component.definitions.set([embeddedQrDefinition])
    await component.connect(embeddedQrDefinition)
    await (component as unknown as TestableConnectorsComponent).pollAuthorization(
      'workspace-1',
      embeddedQrPendingConnector.id
    )

    expect(openSpy).not.toHaveBeenCalled()
    expect(component.pendingAuthorizationUrl(embeddedQrPendingConnector)).toBe('https://auth.example.com/qr/state-2')

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
    component.openConnectorDialog(githubDefinition)
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

  it('does not render user-facing app configuration for the platform OAuth connector', async () => {
    const { component, fixture } = await setup({
      definitions: [dingtalkDefinition],
      connectors: []
    })

    component.definitions.set([dingtalkDefinition])
    component.connectors.set([])
    component.openConnectorDialog(dingtalkDefinition)
    await fixture.whenStable()
    fixture.detectChanges()

    expect((fixture.nativeElement as HTMLElement).querySelector('a[href*="integration/create"]')).toBeNull()
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('input[data-credential-field]')).toHaveLength(0)

    fixture.destroy()
  })

  it('renders credential fields again when a connector is in an error state', async () => {
    const errorGitHubConnector: ConnectorInstance = {
      id: 'github-error',
      workspaceId: 'workspace-1',
      provider: 'github',
      authMethodId: 'github-app-oauth',
      status: 'error',
      lastError: 'Authorization failed'
    }
    const { component, fixture } = await setup({
      definitions: [githubDefinition],
      connectors: [errorGitHubConnector]
    })

    component.definitions.set([githubDefinition])
    component.connectors.set([errorGitHubConnector])
    component.openConnectorDialog(githubDefinition)
    await fixture.whenStable()
    fixture.detectChanges()
    const host = fixture.nativeElement as HTMLElement
    expect(host.querySelector('input[data-credential-field="clientId"]')).not.toBeNull()
    expect(host.querySelector('input[data-credential-field="clientSecret"]')).not.toBeNull()
    expect(host.querySelector('button[data-connector-action="connect"]')).not.toBeNull()
    expect(host.querySelector('button[data-connector-action="disconnect"]')).toBeNull()

    fixture.destroy()
  })

  it('switches authentication methods and removes stale credential controls', async () => {
    const { component, fixture } = await setup()
    const overlayContainer = TestBed.inject(OverlayContainer)

    component.definitions.set([githubDefinition])
    component.connectors.set([])
    component.openConnectorDialog(githubDefinition)
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
    component.openConnectorDialog(githubDefinition)
    fixture.detectChanges()
    component.selectAuthMethod(githubDefinition, 'pat')
    fixture.detectChanges()

    const host = fixture.nativeElement as HTMLElement
    const form = component.formFor(githubDefinition)
    const tokenInput = host.querySelector<HTMLInputElement>('input[data-credential-field="token"]')
    expect(host.querySelectorAll('button[data-connector-action="connect"]')).toHaveLength(1)
    const connectButton = host.querySelector<HTMLButtonElement>('button[data-connector-action="connect"]')
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
    expect(toastr.error).toHaveBeenCalledWith('XP.Xpert.ConnectorCredentialsRequired', 'XP.TOASTR.TITLE.ERROR', {
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
