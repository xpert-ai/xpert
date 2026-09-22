import { Dialog, DialogConfig } from '@angular/cdk/dialog'
import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import type { ConnectorRuntimeOptions } from '@xpert-ai/plugin-sdk'
import type { WorkspaceConnectorConnectResult } from '@xpert-ai/chatkit-types'
import { of, Subject } from 'rxjs'
import { XpertConnectorService } from '../../@core/services/xpert-connector.service'
import { WORKSPACE_CONNECTOR_DIALOG } from '../xpert/workspace/connectors/workspace-connector-dialog'
import { injectWorkspaceConnectorConnect } from './workspace-connector-connect.runtime'

jest.mock('../../@core/services/xpert-connector.service', () => ({ XpertConnectorService: class {} }))
jest.mock('../xpert/workspace/connectors/connectors.component', () => ({ XpertConnectorsComponent: class {} }))

function setup() {
  const assistantId = signal<string | null>('assistant')
  const options: ConnectorRuntimeOptions = {
    scope: { type: 'workspace', workspaceId: 'assistant-workspace' },
    canManageWorkspace: true,
    items: [
      {
        bindingId: 'binding',
        provider: 'example',
        status: 'disconnected',
        granted: false,
        authorizationMode: 'shared',
        canManage: true
      }
    ]
  }
  const runtimeOptions = jest.fn(() => of(options))
  const closed = new Subject<WorkspaceConnectorConnectResult | undefined>()
  const close = jest.fn((value?: WorkspaceConnectorConnectResult) => {
    closed.next(value)
    closed.complete()
  })
  const open = jest.fn<{ closed: typeof closed; close: typeof close }, [unknown, DialogConfig]>(() => ({
    closed,
    close
  }))
  TestBed.configureTestingModule({
    providers: [
      { provide: Dialog, useValue: { open } },
      { provide: XpertConnectorService, useValue: { runtimeOptions } }
    ]
  })
  const connect = TestBed.runInInjectionContext(() => injectWorkspaceConnectorConnect(assistantId))
  TestBed.flushEffects()
  return { assistantId, options, runtimeOptions, open, close, connect }
}
async function settle() {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}
const request = { assistantId: 'assistant', bindingId: 'binding' }

describe('host workspace Connector command', () => {
  afterEach(() => TestBed.resetTestingModule())

  it('opens only the resolved binding in the Assistant workspace and returns no credentials', async () => {
    const { connect, runtimeOptions, open, close } = setup()
    const pending = connect(request)
    await settle()
    expect(runtimeOptions).toHaveBeenCalledWith('assistant')
    expect(open).toHaveBeenCalledTimes(1)
    const config = open.mock.calls[0][1]
    expect(config.injector?.get(WORKSPACE_CONNECTOR_DIALOG)).toEqual({
      workspaceId: 'assistant-workspace',
      bindingId: 'binding'
    })
    close({ status: 'connected' })
    await expect(pending).resolves.toEqual({ status: 'connected' })
  })

  it.each(['workspace', 'binding'] as const)('rejects missing %s configuration permission', async (kind) => {
    const { connect, options, open } = setup()
    if (kind === 'workspace') options.canManageWorkspace = false
    else options.items[0].canManage = false
    await expect(connect(request)).rejects.toThrow('not permitted')
    expect(open).not.toHaveBeenCalled()
  })

  it('rejects a forged Assistant before querying workspace data', async () => {
    const { connect, runtimeOptions, open } = setup()
    await expect(connect({ ...request, assistantId: 'other-assistant' })).rejects.toThrow('Invalid')
    expect(runtimeOptions).not.toHaveBeenCalled()
    expect(open).not.toHaveBeenCalled()
  })

  it('rejects a binding belonging to a different workspace', async () => {
    const { connect, options, open } = setup()
    options.items[0].scope = { type: 'workspace', workspaceId: 'other-workspace' }
    await expect(connect(request)).rejects.toThrow('not permitted')
    expect(open).not.toHaveBeenCalled()
  })

  it('reuses a ready shared connection without starting OAuth again', async () => {
    const { connect, options, open } = setup()
    options.items[0].status = 'active'
    options.items[0].granted = true
    await expect(connect(request)).resolves.toEqual({ status: 'connected' })
    expect(open).not.toHaveBeenCalled()
  })

  it('deduplicates repeated clicks and propagates cancellation', async () => {
    const { connect, open, close } = setup()
    const first = connect(request)
    expect(connect(request)).toBe(first)
    await settle()
    expect(open).toHaveBeenCalledTimes(1)
    close()
    await expect(first).resolves.toEqual({ status: 'cancelled' })
  })

  it('closes the flow when the host switches Assistant', async () => {
    const { connect, assistantId, close } = setup()
    const pending = connect(request)
    await settle()
    assistantId.set('other-assistant')
    TestBed.flushEffects()
    expect(close).toHaveBeenCalledWith({ status: 'cancelled' })
    await expect(pending).resolves.toEqual({ status: 'cancelled' })
  })
})
