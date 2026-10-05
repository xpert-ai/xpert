import { Dialog, DialogConfig } from '@angular/cdk/dialog'
import { HttpClient } from '@angular/common/http'
import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import type { WorkspaceConnectorConnectResult } from '@xpert-ai/chatkit-types'
import { of, Subject, throwError } from 'rxjs'
import { WORKSPACE_CONNECTOR_DIALOG } from '../xpert/workspace/connectors/workspace-connector-dialog'
import { injectBosiConnectorConnect } from './bosi-connector-connect.runtime'

jest.mock('../xpert/workspace/connectors/connectors.component', () => ({ XpertConnectorsComponent: class {} }))
jest.mock('../../@core/state', () => ({ API_PREFIX: '/api' }))

const target = { workspaceId: 'workspace', bindingId: 'binding' }
function setup() {
  const workspace = signal<string | null>('workspace')
  const requestKey = signal('organization:workspace:binding')
  const response = { ...target, connected: false }
  const post = jest.fn(() => of(response))
  const closed = new Subject<WorkspaceConnectorConnectResult>()
  const close = jest.fn((result: WorkspaceConnectorConnectResult) => {
    closed.next(result)
    closed.complete()
  })
  const open = jest.fn<{ closed: typeof closed; close: typeof close }, [unknown, DialogConfig]>(() => ({
    closed,
    close
  }))
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: { post } },
      { provide: Dialog, useValue: { open } }
    ]
  })
  const connect = TestBed.runInInjectionContext(() => injectBosiConnectorConnect(workspace, requestKey))
  TestBed.flushEffects()
  return { workspace, requestKey, response, post, open, close, connect }
}
async function settle() {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

describe('pre-Assistant Bosi Connector handoff', () => {
  afterEach(() => TestBed.resetTestingModule())
  it('revalidates the reserved workspace before opening the exact existing Connector dialog', async () => {
    const f = setup()
    const pending = f.connect(target)
    await settle()
    expect(f.post).toHaveBeenCalledWith('/api/assistant-binding/bosi/onboarding/connection/resolve', target)
    expect(f.open.mock.calls[0][1].injector.get(WORKSPACE_CONNECTOR_DIALOG)).toEqual({
      ...target,
      authorizationNavigation: 'current-tab'
    })
    f.close({ status: 'connected' })
    await expect(pending).resolves.toEqual({ status: 'connected' })
  })
  it('rejects forged scope and a mismatched server response before opening authorization', async () => {
    const f = setup()
    await expect(f.connect({ ...target, workspaceId: 'other' })).rejects.toThrow('Invalid')
    expect(f.post).not.toHaveBeenCalled()
    f.response.bindingId = 'other-binding'
    await expect(f.connect(target)).rejects.toThrow('Invalid')
    expect(f.open).not.toHaveBeenCalled()
  })
  it('propagates denied access and permits an explicit retry after the failure', async () => {
    const f = setup()
    f.post.mockReturnValueOnce(throwError(() => new Error('Forbidden')))
    await expect(f.connect(target)).rejects.toThrow('Forbidden')
    expect(f.open).not.toHaveBeenCalled()
    f.response.connected = true
    await expect(f.connect(target)).resolves.toEqual({ status: 'connected' })
    expect(f.open).not.toHaveBeenCalled()
  })
  it('ignores a preflight response arriving after an organization switch', async () => {
    const f = setup()
    const response = new Subject<typeof f.response>()
    f.post.mockReturnValue(response)
    const pending = f.connect(target)
    f.requestKey.set('other-organization:workspace:binding')
    TestBed.flushEffects()
    response.next(f.response)
    await expect(pending).resolves.toEqual({ status: 'cancelled' })
    expect(f.open).not.toHaveBeenCalled()
  })
  it('closes an open authorization dialog when the organization changes', async () => {
    const f = setup()
    const pending = f.connect(target)
    await settle()
    f.requestKey.set('other-organization:workspace:binding')
    TestBed.flushEffects()
    await expect(pending).resolves.toEqual({ status: 'cancelled' })
    expect(f.close).toHaveBeenCalledWith({ status: 'cancelled' })
  })
})
