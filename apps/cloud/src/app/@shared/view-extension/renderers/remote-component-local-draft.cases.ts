import { ComponentFixture, TestBed } from '@angular/core/testing'
import { Store } from '@cloud/app/@core/state'
import { WORKBENCH_CONTENT_DRAFT_COMMAND, XpertExtensionViewManifest } from '@xpert-ai/contracts'
import { BehaviorSubject, Subject, throwError } from 'rxjs'
import { RemoteComponentRendererComponent } from './remote-component-renderer.component'
import { flushRemoteEntry } from './remote-component-test-utils'

export function registerLocalDraftTests(
  getState: () => {
    api: { getLocalDraftBinding: jest.Mock; getRemoteComponentEntry: jest.Mock }
    manifest: XpertExtensionViewManifest
  }
) {
  async function mount(declareCommand = true) {
    const fixture = TestBed.createComponent(RemoteComponentRendererComponent)
    fixture.componentRef.setInput('hostType', 'agent')
    fixture.componentRef.setInput('hostId', 'assistant-1')
    fixture.componentRef.setInput('runtimeUserId', 'user-1')
    fixture.componentRef.setInput('runtimeScope', { projectId: 'project-1', conversationId: 'run-1' })
    fixture.componentRef.setInput('manifest', {
      ...getState().manifest,
      clientCommands: declareCommand ? [{ key: WORKBENCH_CONTENT_DRAFT_COMMAND, label: { en_US: 'Local drafts' } }] : []
    })
    await flushRemoteEntry(fixture)
    return fixture
  }

  function invoke(
    fixture: ComponentFixture<RemoteComponentRendererComponent>,
    payload: unknown = { operation: 'list', resourceId: 'resource-1' }
  ) {
    const component = fixture.componentInstance as unknown as {
      handleClientCommandRequest(message: { commandKey: string; payload: unknown }): Promise<unknown>
    }
    return component.handleClientCommandRequest({ commandKey: WORKBENCH_CONTENT_DRAFT_COMMAND, payload })
  }

  it('requires a manifest command before authorizing browser drafts', async () => {
    const fixture = await mount(false)
    await expect(invoke(fixture)).rejects.toThrow('is not available')
    expect(getState().api.getLocalDraftBinding).not.toHaveBeenCalled()
  })

  it('rejects frame-selected storage scope before contacting the authorization endpoint', async () => {
    const fixture = await mount()
    await expect(
      invoke(fixture, { operation: 'list', resourceId: 'resource-1', scopeKey: 'other-user' })
    ).rejects.toMatchObject({ code: 'invalid' })
    expect(getState().api.getLocalDraftBinding).not.toHaveBeenCalled()
  })

  it('propagates server denial with the trusted host and runtime scope', async () => {
    const fixture = await mount()
    const api = getState().api
    api.getLocalDraftBinding.mockReturnValue(throwError(() => new Error('Draft access denied')))
    await expect(invoke(fixture)).rejects.toThrow('Draft access denied')
    expect(api.getLocalDraftBinding).toHaveBeenCalledWith(
      'agent',
      'assistant-1',
      getState().manifest.key,
      'resource-1',
      {
        projectId: 'project-1',
        conversationId: 'run-1'
      }
    )
  })

  it.each(['scope', 'organization', 'user', 'destroy'] as const)(
    'cancels draft authorization on %s changes',
    async (change) => {
      const fixture = await mount()
      const request = new Subject<never>()
      getState().api.getLocalDraftBinding.mockReturnValue(request)
      const result = invoke(fixture).then(
        () => 'unexpected-success',
        (error: unknown) => error
      )
      expect(request.observed).toBe(true)

      if (change === 'destroy') fixture.destroy()
      else {
        if (change === 'scope')
          fixture.componentRef.setInput('runtimeScope', { projectId: 'project-2', conversationId: 'run-2' })
        if (change === 'user') fixture.componentRef.setInput('runtimeUserId', 'user-2')
        if (change === 'organization') {
          const organization = TestBed.inject(Store).selectedOrganization$ as BehaviorSubject<{ id: string }>
          organization.next({ id: 'organization-2' })
        }
        await flushRemoteEntry(fixture)
      }

      expect(request.observed).toBe(false)
      expect(await result).toBeInstanceOf(Error)
    }
  )

  it('passes disposal to the SDK before any further draft authorization', async () => {
    const fixture = await mount()
    fixture.destroy()
    await expect(invoke(fixture)).rejects.toMatchObject({ name: 'AbortError' })
    expect(getState().api.getLocalDraftBinding).not.toHaveBeenCalled()
  })
}
