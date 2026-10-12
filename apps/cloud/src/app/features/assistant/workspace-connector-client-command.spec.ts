import { Dialog, DialogConfig } from '@angular/cdk/dialog'
import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'
import type { ConnectorBinding, ConnectorRuntimeOptions } from '@xpert-ai/plugin-sdk/connector'
import type { WorkspaceConnectorConnectResult } from '@xpert-ai/chatkit-types'
import { of, Subject } from 'rxjs'
import { XpertConnectorService } from '../../@core/services/xpert-connector.service'
import {
  ViewClientCommandContext,
  ViewClientCommandRegistry
} from '../../@shared/view-extension/view-client-command-registry.service'
import { WORKSPACE_CONNECTOR_DIALOG } from '../xpert/workspace/connectors/workspace-connector-dialog'
import { injectWorkspaceConnectorClientCommand } from './workspace-connector-client-command'
import { WorkspaceConnectorMigrationDialogComponent } from './workspace-connector-migration-dialog.component'

jest.mock('../../@core/services/xpert-connector.service', () => ({ XpertConnectorService: class {} }))
jest.mock('../xpert/workspace/connectors/connectors.component', () => ({ XpertConnectorsComponent: class {} }))
jest.mock('./workspace-connector-migration-dialog.component', () => ({
  WorkspaceConnectorMigrationDialogComponent: class {}
}))

const scope = { type: 'workspace' as const, workspaceId: 'workspace-b' }
const shared: ConnectorBinding = {
  id: 'binding',
  provider: 'github',
  authorizationMode: 'shared',
  status: 'disconnected',
  scopeType: 'workspace',
  scope,
  workspaceId: scope.workspaceId
}
const context: ViewClientCommandContext = {
  hostType: 'agent',
  hostId: 'assistant-b',
  viewKey: 'review',
  manifest: {
    key: 'review',
    title: 'Review',
    hostType: 'agent',
    slot: 'agent.workbench',
    source: { provider: 'review' },
    view: { type: 'remote_component', component: { isolation: 'iframe', entry: 'review' } },
    dataSource: { mode: 'platform' }
  }
}
async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

function setup(authorizationMode: 'shared' | 'personal' = 'shared') {
  const assistantId = signal<string | null>('assistant-b')
  const binding = { ...shared, authorizationMode }
  const options: ConnectorRuntimeOptions = {
    scope,
    canManageWorkspace: true,
    items: [
      {
        bindingId: binding.id,
        provider: 'github',
        scope,
        authorizationMode,
        status: 'disconnected',
        granted: false,
        canManage: true
      }
    ]
  }
  const service = {
    runtimeOptions: jest.fn(() => of(options)),
    scopedDefinitions: jest.fn(() => of([{ provider: 'github' }])),
    listBindings: jest.fn(() => of([binding])),
    createBinding: jest.fn(() => of(binding))
  }
  const closed = new Subject<WorkspaceConnectorConnectResult | 'manage' | undefined>()
  const close = jest.fn((value?: WorkspaceConnectorConnectResult | 'manage') => {
    closed.next(value)
    closed.complete()
  })
  const open = jest.fn<{ closed: typeof closed; close: typeof close }, [unknown, DialogConfig]>(() => ({
    closed,
    close
  }))
  const navigate = jest.fn(async () => true)
  TestBed.configureTestingModule({
    providers: [
      { provide: XpertConnectorService, useValue: service },
      { provide: Dialog, useValue: { open } },
      { provide: Router, useValue: { navigate } }
    ]
  })
  TestBed.runInInjectionContext(() => injectWorkspaceConnectorClientCommand(assistantId))
  TestBed.tick()
  const registry = TestBed.inject(ViewClientCommandRegistry)
  const run = (hostId = 'assistant-b') =>
    registry.execute('workspace.connector.connect', { provider: 'github' }, { ...context, hostId })
  return { assistantId, binding, options, service, close, open, navigate, run, registry }
}

describe('workspace connector view command', () => {
  afterEach(() => TestBed.resetTestingModule())

  it('authorizes the active ChatKit Assistant and rejects the previous host', async () => {
    const { run, service, open, close } = setup()
    await expect(run('assistant-a')).resolves.toMatchObject({ code: 'invalid_payload' })
    expect(service.runtimeOptions).not.toHaveBeenCalled()
    const pending = run()
    await settle()
    expect(service.runtimeOptions).toHaveBeenCalledWith('assistant-b')
    expect(open.mock.calls[0][1].injector?.get(WORKSPACE_CONNECTOR_DIALOG)).toMatchObject({
      workspaceId: 'workspace-b',
      bindingId: 'binding'
    })
    expect(service.createBinding).not.toHaveBeenCalled()
    close({ status: 'connected' })
    await expect(pending).resolves.toEqual({ success: true, data: { status: 'connected' } })
  })

  it('shows migration for an existing personal binding without creating or connecting again', async () => {
    const { run, service, open, close, navigate } = setup('personal')
    const pending = run()
    await settle()
    expect(open).toHaveBeenCalledWith(WorkspaceConnectorMigrationDialogComponent, expect.anything())
    expect(service.createBinding).not.toHaveBeenCalled()
    close()
    await expect(pending).resolves.toEqual({ success: true, data: { status: 'cancelled' } })
    expect(navigate).not.toHaveBeenCalled()
  })

  it('opens only the resolved workspace management route after choosing migration', async () => {
    const { run, service, close, navigate } = setup('personal')
    const pending = run()
    await settle()
    close('manage')
    await expect(pending).resolves.toMatchObject({ data: { status: 'cancelled' } })
    expect(navigate).toHaveBeenCalledWith(['/xpert/w', 'workspace-b', 'connectors'])
    expect(service.createBinding).not.toHaveBeenCalled()
  })

  it.each(['shared', 'personal'] as const)('closes the %s flow when the active Assistant changes', async (mode) => {
    const { run, assistantId, close, navigate } = setup(mode)
    const pending = run()
    await settle()
    assistantId.set('assistant-c')
    TestBed.tick()
    expect(close).toHaveBeenCalledWith({ status: 'cancelled' })
    await expect(pending).resolves.toMatchObject({ data: { status: 'cancelled' } })
    expect(navigate).not.toHaveBeenCalled()
  })

  it('discards a bindings response after the Assistant changes', async () => {
    const { run, assistantId, service, open } = setup()
    const response = new Subject<ConnectorBinding[]>()
    service.listBindings.mockReturnValueOnce(response)
    const pending = run()
    await settle()
    assistantId.set('assistant-c')
    response.next([])
    await expect(pending).resolves.toMatchObject({ code: 'context_changed' })
    expect(service.createBinding).not.toHaveBeenCalled()
    expect(open).not.toHaveBeenCalled()
  })

  it('creates a shared binding only when the provider has no existing binding', async () => {
    const { run, service, close } = setup()
    service.listBindings.mockReturnValueOnce(of([]))
    const pending = run()
    await settle()
    expect(service.createBinding).toHaveBeenCalledWith({ scope, provider: 'github', authorizationMode: 'shared' })
    close()
    await pending
  })

  it('checks management permission before exposing a legacy binding', async () => {
    const { run, options, service, open } = setup('personal')
    options.canManageWorkspace = false
    await expect(run()).resolves.toMatchObject({ code: 'workspace_management_required' })
    expect(service.listBindings).not.toHaveBeenCalled()
    expect(open).not.toHaveBeenCalled()
  })
})
