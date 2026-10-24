import { Dialog, DialogConfig } from '@angular/cdk/dialog'
import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'
import type {
  ConnectorBinding,
  ConnectorRuntimeOptions,
  ConnectorStrategyDefinition
} from '@xpert-ai/plugin-sdk/connector'
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
const integrationId = '00000000-0000-4000-8000-000000000001'
const shared: ConnectorBinding = {
  id: 'binding',
  provider: 'example',
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

const definition: ConnectorStrategyDefinition = {
  provider: 'example',
  label: 'Example Connector',
  authMethods: [
    {
      id: 'app-oauth',
      type: 'oauth2',
      label: 'App OAuth',
      appCredentials: { integration: { provider: 'example-app', fields: [] } }
    }
  ]
}
const constrainedPayload = { provider: 'example', authMethodId: 'app-oauth', integrationId }

function setup(authorizationMode: 'shared' | 'personal' = 'shared', connector = definition) {
  const assistantId = signal<string | null>('assistant-b')
  const binding = { ...shared, provider: connector.provider, authorizationMode }
  const options: ConnectorRuntimeOptions = {
    scope,
    canManageWorkspace: true,
    items: [
      {
        bindingId: binding.id,
        provider: connector.provider,
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
    scopedDefinitions: jest.fn(() => of([connector])),
    listBindings: jest.fn(() => of([binding])),
    createBinding: jest.fn(() => of(binding)),
    integrationOptions: jest.fn(() => of([{ id: integrationId }]))
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
    registry.execute('workspace.connector.connect', { provider: connector.provider }, { ...context, hostId })
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
    expect(service.createBinding).toHaveBeenCalledWith({ scope, provider: 'example', authorizationMode: 'shared' })
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

  it.each(['oauth2', 'api_key'] as const)(
    'uses declared %s integration support for an arbitrary provider',
    async (type) => {
      const credentials = { integration: { provider: 'example-app', fields: [] } }
      const connector: ConnectorStrategyDefinition = {
        ...definition,
        authMethods: [
          type === 'oauth2'
            ? { id: 'app-auth', type, label: 'App', appCredentials: credentials }
            : { id: 'app-auth', type, label: 'App', credentials }
        ]
      }
      const { registry, service, open, close } = setup('shared', connector)
      const pending = registry.execute(
        'workspace.connector.connect',
        { ...constrainedPayload, authMethodId: 'app-auth' },
        context
      )
      await settle()
      expect(service.integrationOptions).toHaveBeenCalledWith('workspace-b', 'example', 'app-auth')
      expect(open.mock.calls[0][1].injector?.get(WORKSPACE_CONNECTOR_DIALOG)).toMatchObject({
        requiredAuthMethodId: 'app-auth',
        requiredIntegrationId: integrationId
      })
      close()
      await expect(pending).resolves.toMatchObject({ data: { status: 'cancelled' } })
    }
  )

  it('supports a declared authentication method without requiring an integration', async () => {
    const { registry, service, open, close } = setup()
    const pending = registry.execute(
      'workspace.connector.connect',
      { provider: 'example', authMethodId: 'app-oauth' },
      context
    )
    await settle()
    expect(service.integrationOptions).not.toHaveBeenCalled()
    expect(open.mock.calls[0][1].injector?.get(WORKSPACE_CONNECTOR_DIALOG)).toEqual({
      workspaceId: 'workspace-b',
      bindingId: 'binding',
      requiredAuthMethodId: 'app-oauth'
    })
    close()
    await pending
  })

  it.each([
    { provider: 'example', integrationId },
    { ...constrainedPayload, integrationId: 'not-a-uuid' },
    { ...constrainedPayload, authMethodId: '' },
    { ...constrainedPayload, authMethodId: 42 },
    { ...constrainedPayload, integrationId: null },
    { ...constrainedPayload, workspaceId: 'forged-workspace' },
    { ...constrainedPayload, token: 'unexpected-secret' }
  ])('rejects invalid authorization intent before resolving host data: %j', async (payload) => {
    const { registry, service, open } = setup()
    await expect(registry.execute('workspace.connector.connect', payload, context)).resolves.toMatchObject({
      code: 'invalid_payload'
    })
    expect(service.runtimeOptions).not.toHaveBeenCalled()
    expect(open).not.toHaveBeenCalled()
  })

  it.each([
    { connector: { ...definition, unavailable: 'not-installed' }, code: 'connector_not_installed' },
    {
      connector: { ...definition, authMethods: [{ id: 'other', type: 'oauth2' as const, label: 'Other' }] },
      code: 'connector_auth_method_unavailable'
    },
    {
      connector: {
        ...definition,
        authMethods: [{ id: 'app-oauth', type: 'oauth2' as const, label: 'Old', deprecated: true }]
      },
      code: 'connector_auth_method_unavailable'
    },
    {
      connector: { ...definition, authMethods: [{ id: 'app-oauth', type: 'oauth2' as const, label: 'Inline' }] },
      code: 'connector_integration_unsupported'
    }
  ])('rejects unsupported declarations with $code', async ({ connector, code }) => {
    const { registry, service, open } = setup('shared', connector)
    await expect(registry.execute('workspace.connector.connect', constrainedPayload, context)).resolves.toMatchObject({
      code
    })
    expect(service.integrationOptions).not.toHaveBeenCalled()
    expect(service.listBindings).not.toHaveBeenCalled()
    expect(service.createBinding).not.toHaveBeenCalled()
    expect(open).not.toHaveBeenCalled()
  })

  it('rejects an inaccessible integration before creating a binding', async () => {
    const { registry, service, open } = setup()
    service.integrationOptions.mockReturnValueOnce(of([]))
    service.listBindings.mockReturnValueOnce(of([]))
    await expect(registry.execute('workspace.connector.connect', constrainedPayload, context)).resolves.toMatchObject({
      code: 'connector_integration_unavailable'
    })
    expect(service.listBindings).not.toHaveBeenCalled()
    expect(service.createBinding).not.toHaveBeenCalled()
    expect(open).not.toHaveBeenCalled()
  })

  it.each(['active', 'pending'] as const)(
    'does not replace a %s shared credential for a different method or integration',
    async (status) => {
      const { registry, binding, service, open } = setup()
      binding.status = status
      for (const mismatch of [
        { authMethodId: 'app-oauth', appIntegrationId: 'another-app' },
        { authMethodId: 'another-method', appIntegrationId: integrationId }
      ]) {
        Object.assign(binding, mismatch)
        await expect(
          registry.execute('workspace.connector.connect', constrainedPayload, context)
        ).resolves.toMatchObject({ code: 'connector_connection_mismatch' })
      }
      expect(service.createBinding).not.toHaveBeenCalled()
      expect(open).not.toHaveBeenCalled()
    }
  )

  it('allows a matching shared connection and rechecks it in the host dialog', async () => {
    const { registry, binding, close, open } = setup()
    Object.assign(binding, { status: 'active', authMethodId: 'app-oauth', appIntegrationId: integrationId })
    const pending = registry.execute('workspace.connector.connect', constrainedPayload, context)
    await settle()
    expect(open).toHaveBeenCalledTimes(1)
    close({ status: 'connected' })
    await expect(pending).resolves.toMatchObject({ success: true, data: { status: 'connected' } })
  })
})
