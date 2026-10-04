import { TestBed } from '@angular/core/testing'
import { of, Subject, throwError } from 'rxjs'
import { XpertExtensionViewManifest } from '@xpert-ai/contracts'
import { RemoteComponentRendererComponent } from './remote-component-renderer.component'

export function registerContextTests(
  getState: () => {
    api: {
      getViewData: jest.Mock
      getRemoteComponentEntry: jest.Mock
      createViewFileAccessSession: jest.Mock
      revokeViewFileAccessSession: jest.Mock
    }
    manifest: XpertExtensionViewManifest
  },
  flushRemoteEntry: (fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) => Promise<void>
) {
  let api: ReturnType<typeof getState>['api'], manifest: XpertExtensionViewManifest
  beforeEach(() => {
    ;({ api, manifest } = getState())
  })
  it('revalidates a conversation change without replacing an identical iframe document', async () => {
    const fixture = TestBed.createComponent(RemoteComponentRendererComponent)
    fixture.componentRef.setInput('hostType', 'agent')
    fixture.componentRef.setInput('hostId', 'assistant-1')
    fixture.componentRef.setInput('manifest', manifest)
    fixture.componentRef.setInput('runtimeScope', { projectId: 'project-1', conversationId: 'run-1' })
    await flushRemoteEntry(fixture)
    const frame: HTMLIFrameElement = fixture.nativeElement.querySelector('iframe')
    const src = frame.getAttribute('src')
    const instance = fixture.componentInstance.instanceId()
    fixture.componentRef.setInput('runtimeScope', { projectId: 'project-1', conversationId: 'run-2' })
    await flushRemoteEntry(fixture)
    expect(api.getRemoteComponentEntry).toHaveBeenLastCalledWith('agent', 'assistant-1', manifest.key, {
      projectId: 'project-1',
      conversationId: 'run-2'
    })
    expect(fixture.nativeElement.querySelector('iframe')).toBe(frame)
    expect(frame.getAttribute('src')).toBe(src)
    expect(fixture.componentInstance.instanceId()).toBe(instance)
    api.getRemoteComponentEntry.mockReturnValueOnce(of('<html>Updated automotive view</html>'))
    fixture.componentRef.setInput('runtimeScope', { projectId: 'project-1', conversationId: 'run-3' })
    await flushRemoteEntry(fixture)
    expect(fixture.componentInstance.instanceId()).not.toBe(instance)
    fixture.destroy()
  })

  it('removes the previous document when conversation access revalidation fails', async () => {
    const fixture = TestBed.createComponent(RemoteComponentRendererComponent)
    fixture.componentRef.setInput('hostType', 'agent')
    fixture.componentRef.setInput('hostId', 'assistant-1')
    fixture.componentRef.setInput('manifest', manifest)
    fixture.componentRef.setInput('runtimeScope', { projectId: 'project-1', conversationId: 'run-1' })
    await flushRemoteEntry(fixture)
    expect(fixture.componentInstance.entryUrl()).toBeTruthy()
    api.getRemoteComponentEntry.mockReturnValueOnce(throwError(() => new Error('Access denied')))
    fixture.componentRef.setInput('runtimeScope', { projectId: 'project-1', conversationId: 'run-2' })
    await flushRemoteEntry(fixture)
    expect(fixture.componentInstance.entryUrl()).toBeNull()
    expect(fixture.componentInstance.error()).toBe('Access denied')
    fixture.destroy()
  })

  it('updates Project runtime scope without replacing the mounted renderer and drops the old file session', async () => {
    const fixture = TestBed.createComponent(RemoteComponentRendererComponent)
    fixture.componentRef.setInput('hostType', 'agent')
    fixture.componentRef.setInput('hostId', 'assistant-1')
    fixture.componentRef.setInput('runtimeScope', { projectId: 'project-1', conversationId: null })
    fixture.componentRef.setInput('manifest', {
      ...manifest,
      fileAccess: { purposes: ['preview'] }
    })
    await flushRemoteEntry(fixture)

    const component = fixture.componentInstance as unknown as {
      handleFileAccessRequest(message: Record<string, unknown>): Promise<unknown>
      handleMessage(event: Pick<MessageEvent, 'data' | 'source'>): void
    }
    await component.handleFileAccessRequest({ fileKey: 'asset-1', purpose: 'preview' })
    const initialSrc = (fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement).getAttribute('src')

    fixture.componentRef.setInput('runtimeScope', { projectId: 'project-2', conversationId: null })
    await flushRemoteEntry(fixture)

    expect(fixture.componentInstance).toBe(component)
    expect(api.getRemoteComponentEntry).toHaveBeenLastCalledWith('agent', 'assistant-1', manifest.key, {
      projectId: 'project-2',
      conversationId: null
    })
    expect(api.revokeViewFileAccessSession).toHaveBeenCalledWith('session-1')
    const updatedFrame = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement
    expect(updatedFrame.getAttribute('src')).toBe(initialSrc)

    const postMessage = jest
      .spyOn(updatedFrame.contentWindow as Window, 'postMessage')
      .mockImplementation(() => undefined)
    component.handleMessage({
      source: updatedFrame.contentWindow,
      data: { channel: 'xpertai.remote_component', protocolVersion: 1, type: 'ready' }
    })
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'init',
        runtimeScope: { projectId: 'project-2', conversationId: null }
      }),
      '*'
    )

    await component.handleFileAccessRequest({ fileKey: 'asset-2', purpose: 'preview' })
    expect(api.createViewFileAccessSession).toHaveBeenLastCalledWith('agent', 'assistant-1', manifest.key, {
      projectId: 'project-2',
      conversationId: null
    })
  })

  it('keeps an inactive iframe mounted and reports tab activation without refetching its entry', async () => {
    const fixture = TestBed.createComponent(RemoteComponentRendererComponent)
    fixture.componentRef.setInput('hostType', 'agent')
    fixture.componentRef.setInput('hostId', 'assistant-1')
    fixture.componentRef.setInput('manifest', manifest)
    fixture.componentRef.setInput('active', true)
    await flushRemoteEntry(fixture)

    const frame = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement
    const postMessage = jest.spyOn(frame.contentWindow as Window, 'postMessage').mockImplementation(() => undefined)
    const component = fixture.componentInstance as unknown as {
      handleMessage(event: Pick<MessageEvent, 'data' | 'source'>): void
    }
    component.handleMessage({
      source: frame.contentWindow,
      data: { channel: 'xpertai.remote_component', protocolVersion: 1, type: 'ready' }
    })
    postMessage.mockClear()

    fixture.componentRef.setInput('active', false)
    fixture.detectChanges()
    await fixture.whenStable()
    expect(fixture.nativeElement.querySelector('iframe')).toBe(frame)
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'viewActive', active: false }), '*')

    fixture.componentRef.setInput('active', true)
    fixture.detectChanges()
    await fixture.whenStable()
    expect(fixture.nativeElement.querySelector('iframe')).toBe(frame)
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'viewActive', active: true }), '*')
    expect(api.getRemoteComponentEntry).toHaveBeenCalledTimes(1)
  })

  it('broadcasts context changes to a hidden mounted View without a manifest subscription', async () => {
    const fixture = TestBed.createComponent(RemoteComponentRendererComponent)
    fixture.componentRef.setInput('hostType', 'agent')
    fixture.componentRef.setInput('hostId', 'assistant-1')
    fixture.componentRef.setInput('manifest', manifest)
    await flushRemoteEntry(fixture)
    const frame: HTMLIFrameElement = fixture.nativeElement.querySelector('iframe')
    const postMessage = jest.spyOn(frame.contentWindow as Window, 'postMessage').mockImplementation(() => undefined)
    window.dispatchEvent(
      new MessageEvent('message', {
        source: frame.contentWindow,
        data: {
          channel: 'xpertai.remote_component',
          protocolVersion: 1,
          type: 'ready'
        }
      })
    )
    postMessage.mockClear()
    fixture.componentRef.setInput('active', false)
    fixture.componentRef.setInput('runtimeScope', { projectId: 'project-2', conversationId: 'conversation-2' })
    await flushRemoteEntry(fixture)
    expect(fixture.nativeElement.querySelector('iframe')).toBe(frame)
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'hostEvent',
        event: expect.objectContaining({
          type: 'view.context.changed',
          data: {
            revision: expect.any(Number),
            runtimeScope: { projectId: 'project-2', conversationId: 'conversation-2' }
          }
        })
      }),
      '*'
    )
  })
  it('cancels old reads and re-initializes an internally reset View in the new context', async () => {
    const fixture = TestBed.createComponent(RemoteComponentRendererComponent)
    fixture.componentRef.setInput('hostType', 'agent')
    fixture.componentRef.setInput('hostId', 'assistant-1')
    fixture.componentRef.setInput('manifest', manifest)
    await flushRemoteEntry(fixture)
    const frame: HTMLIFrameElement = fixture.nativeElement.querySelector('iframe')
    const postMessage = jest.spyOn(frame.contentWindow as Window, 'postMessage').mockImplementation(() => undefined)
    const send = (data: object) =>
      window.dispatchEvent(
        new MessageEvent('message', {
          source: frame.contentWindow,
          data: {
            channel: 'xpertai.remote_component',
            protocolVersion: 1,
            instanceId: fixture.componentInstance.instanceId(),
            ...data
          }
        })
      )
    send({ type: 'ready' })
    const old = new Subject<unknown>()
    api.getViewData.mockReturnValueOnce(old)
    send({ type: 'requestData', requestId: 'old-read', query: {} })
    fixture.componentRef.setInput('runtimeScope', { projectId: 'next-project', conversationId: null })
    await flushRemoteEntry(fixture)
    old.next({ items: [{ id: 'old-result' }] })
    old.complete()
    await flushRemoteEntry(fixture)
    expect(postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ requestId: 'old-read' }), '*')
    postMessage.mockClear()
    send({ type: 'ready' })
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'init',
        runtimeScope: { projectId: 'next-project', conversationId: null },
        scopeRevision: expect.any(Number)
      }),
      '*'
    )
  })
}
