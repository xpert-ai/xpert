import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import type {
  ConnectorDefinition,
  ConnectorInstance,
  ConnectorOAuthStartResponse,
  ConnectorOAuthStatusResponse
} from '@xpert-ai/plugin-sdk'
import { TranslateModule } from '@ngx-translate/core'
import { of } from 'rxjs'
import { ToastrService, XpertWorkspaceConnectorService, XpertWorkspaceService } from 'apps/cloud/src/app/@core'
import { XpertWorkspaceHomeComponent } from '../home/home.component'
import { XpertWorkspaceConnectorsComponent } from './connectors.component'

jest.mock('apps/cloud/src/app/@core', () => {
  const { inject } = require('@angular/core')

  class ToastrService {}
  class XpertWorkspaceConnectorService {}
  class XpertWorkspaceService {}

  return {
    ToastrService,
    XpertWorkspaceConnectorService,
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

const connectorDefinition: ConnectorDefinition = {
  provider: 'example',
  label: 'Example Connector',
  description: 'Connect an external workspace service',
  auth: {
    type: 'oauth2',
    authorizationUrl: '',
    tokenUrl: ''
  }
}

type TestableConnectorsComponent = XpertWorkspaceConnectorsComponent & {
  pollAuthorization(workspaceId: string, connectorId: string): Promise<void>
}

async function setup(options?: {
  connectors?: ConnectorInstance[]
  connectResponse?: ConnectorOAuthStartResponse
  pollResponse?: ConnectorOAuthStatusResponse
}) {
  const workspace = signal<{ id: string } | null>(null)
  const pollResponse = options?.pollResponse ?? {
    connector: pendingConnector,
    authorizationUrl: 'https://accounts.example.com/oauth/continue',
    pollIntervalSeconds: 5
  }
  const connectorService = {
    definitions: jest.fn(() => of([connectorDefinition])),
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
    imports: [TranslateModule.forRoot(), XpertWorkspaceConnectorsComponent],
    providers: [
      {
        provide: XpertWorkspaceHomeComponent,
        useValue: {
          workspace
        }
      },
      {
        provide: XpertWorkspaceConnectorService,
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

  const fixture = TestBed.createComponent(XpertWorkspaceConnectorsComponent)
  fixture.detectChanges()

  return {
    fixture,
    component: fixture.componentInstance,
    connectorService,
    toastr,
    workspace
  }
}

describe('XpertWorkspaceConnectorsComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('recovers a pending authorization URL when loading existing pending connectors', async () => {
    const popup = { opener: window, focus: jest.fn(), location: { assign: jest.fn() } } as unknown as Window
    const openSpy = jest.spyOn(window, 'open').mockReturnValue(popup)
    const { component, connectorService, fixture } = await setup()

    await component.load('workspace-1')

    expect(connectorService.pollAuthorization).toHaveBeenCalledWith('workspace-1', 'connector-1')
    expect(component.pendingAuthorizationUrl(pendingConnector)).toBe('https://accounts.example.com/oauth/continue')
    expect(openSpy).toHaveBeenCalledWith('', '_blank')
    expect(popup.location.assign).toHaveBeenCalledWith('https://accounts.example.com/oauth/continue')

    fixture.destroy()
  })

  it('opens connector authorization in a new window when connecting', async () => {
    const popup = { opener: window, focus: jest.fn(), location: { assign: jest.fn() } } as unknown as Window
    const openSpy = jest.spyOn(window, 'open').mockReturnValue(popup)
    const { component, connectorService, fixture, workspace } = await setup({
      connectResponse: {
        connector: pendingConnector,
        authorizationUrl: 'https://accounts.example.com/oauth/start',
        stateExpiresAt: '2026-01-01T00:00:00.000Z',
        pollIntervalSeconds: 5
      }
    })

    workspace.set({ id: 'workspace-1' })
    await component.connect(connectorDefinition)

    expect(connectorService.connect).toHaveBeenCalledWith('workspace-1', 'example', {})
    expect(openSpy).toHaveBeenCalledWith('', '_blank')
    expect(popup.location.assign).toHaveBeenCalledWith('https://accounts.example.com/oauth/start')
    expect(popup.opener).toBeNull()

    fixture.destroy()
  })

  it('does not replace the current page when the authorization popup is blocked', async () => {
    const openSpy = jest.spyOn(window, 'open').mockReturnValue(null)
    const { component, fixture, toastr, workspace } = await setup({
      connectResponse: {
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
    const assignSpy = jest.fn()
    const focusSpy = jest.fn()
    const popup = {
      opener: window,
      closed: false,
      focus: focusSpy,
      location: {
        assign: assignSpy
      }
    } as unknown as Window
    const openSpy = jest.spyOn(window, 'open').mockReturnValue(popup)
    const { component, fixture, workspace } = await setup({
      connectResponse: {
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
    assignSpy.mockClear()
    focusSpy.mockClear()
    await (component as unknown as TestableConnectorsComponent).pollAuthorization('workspace-1', 'connector-1')

    expect(openSpy).toHaveBeenCalledTimes(1)
    expect(assignSpy).not.toHaveBeenCalled()
    expect(focusSpy).not.toHaveBeenCalled()

    fixture.destroy()
  })

  it('reuses the opened authorization window when polling returns a continuation URL', async () => {
    const popup = {
      opener: window,
      closed: false,
      focus: jest.fn(),
      location: {
        assign: jest.fn()
      }
    } as unknown as Window
    const openSpy = jest.spyOn(window, 'open').mockReturnValue(popup)
    const { component, fixture, workspace } = await setup({
      connectResponse: {
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
    await (component as any).pollAuthorization('workspace-1', 'connector-1')

    expect(openSpy).toHaveBeenCalledTimes(1)
    expect(popup.location.assign).toHaveBeenCalledWith('https://accounts.example.com/oauth/continue')
    expect(popup.focus).toHaveBeenCalled()

    fixture.destroy()
  })

  it('stops pending authorization polling when the workspace changes', async () => {
    jest.useFakeTimers()
    const popup = { opener: window, focus: jest.fn(), location: { assign: jest.fn() } } as unknown as Window
    jest.spyOn(window, 'open').mockReturnValue(popup)
    const { component, connectorService, fixture, workspace } = await setup({
      connectors: [],
      connectResponse: {
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
})
