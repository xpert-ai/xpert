import { TestBed } from '@angular/core/testing'
import type { XpertExtensionViewManifest } from '@xpert-ai/contracts'
import { RemoteComponentRendererComponent } from './remote-component-renderer.component'

export function registerViewStateTests(
  manifest: XpertExtensionViewManifest,
  flush: (fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) => Promise<void>
) {
  it('restores UI state on a new frame and rejects unrelated or stale frame writes', async () => {
    sessionStorage.clear()
    const create = async () => {
      const fixture = TestBed.createComponent(RemoteComponentRendererComponent)
      fixture.componentRef.setInput('hostType', 'project')
      fixture.componentRef.setInput('hostId', 'state-test-project')
      fixture.componentRef.setInput('runtimeUserId', 'state-test-user')
      fixture.componentRef.setInput('manifest', manifest)
      await flush(fixture)
      const frame = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement
      const frameWindow = frame.contentWindow as Window
      const post = jest.spyOn(frameWindow, 'postMessage').mockImplementation(() => undefined)
      return { fixture, frameWindow, post }
    }
    const first = await create()
    const send = (source: Window, instanceId: string, scopeRevision?: number) =>
      window.dispatchEvent(
        new MessageEvent('message', {
          source,
          data: {
            channel: 'xpertai.remote_component',
            protocolVersion: 1,
            type: 'saveViewState',
            instanceId,
            scopeRevision,
            state: { initialTab: 'pipeline', scrollLeft: 620 }
          }
        })
      )
    send(window, first.fixture.componentInstance.instanceId())
    send(first.frameWindow, 'other-frame')
    send(first.frameWindow, first.fixture.componentInstance.instanceId(), 99999)
    expect(sessionStorage.length).toBe(0)
    send(first.frameWindow, first.fixture.componentInstance.instanceId())
    first.fixture.destroy()
    const restored = await create()
    window.dispatchEvent(
      new MessageEvent('message', {
        source: restored.frameWindow,
        data: {
          channel: 'xpertai.remote_component',
          protocolVersion: 1,
          type: 'ready'
        }
      })
    )
    expect(restored.post).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'init', viewState: { initialTab: 'pipeline', scrollLeft: 620 } }),
      '*'
    )
    restored.fixture.destroy()
    sessionStorage.clear()
  })

  it('does not persist anonymous state or reuse another user state after host identity changes', async () => {
    sessionStorage.clear()
    const fixture = TestBed.createComponent(RemoteComponentRendererComponent)
    fixture.componentRef.setInput('hostType', 'project')
    fixture.componentRef.setInput('hostId', 'shared-project')
    fixture.componentRef.setInput('manifest', manifest)
    const send = (state: { scrollLeft: number }) => {
      const frame = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement
      window.dispatchEvent(
        new MessageEvent('message', {
          source: frame.contentWindow,
          data: {
            channel: 'xpertai.remote_component',
            protocolVersion: 1,
            type: 'saveViewState',
            instanceId: fixture.componentInstance.instanceId(),
            state
          }
        })
      )
    }
    await flush(fixture)
    send({ scrollLeft: 100 })
    expect(sessionStorage.length).toBe(0)
    fixture.componentRef.setInput('runtimeUserId', 'first-user')
    await flush(fixture)
    send({ scrollLeft: 600 })
    expect(sessionStorage.length).toBe(1)
    for (const [user, state] of [
      ['second-user', null],
      ['first-user', { scrollLeft: 600 }]
    ] as const) {
      fixture.componentRef.setInput('runtimeUserId', user)
      await flush(fixture)
      const frame = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement
      const post = jest.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => undefined)
      window.dispatchEvent(
        new MessageEvent('message', {
          source: frame.contentWindow,
          data: { channel: 'xpertai.remote_component', protocolVersion: 1, type: 'ready' }
        })
      )
      expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: 'init', viewState: state }), '*')
    }
    fixture.destroy()
    sessionStorage.clear()
  })
}
