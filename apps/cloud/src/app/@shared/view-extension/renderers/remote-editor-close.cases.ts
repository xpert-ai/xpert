import { TestBed } from '@angular/core/testing'
import type { XpertExtensionViewManifest } from '@xpert-ai/contracts'
import { RemoteComponentRendererComponent } from './remote-component-renderer.component'
import { flushRemoteEntry } from './remote-component-test-utils'

export function registerEditorCloseTests(manifest: () => XpertExtensionViewManifest) {
  async function setup() {
    const fixture = TestBed.createComponent(RemoteComponentRendererComponent)
    fixture.componentRef.setInput('hostType', 'project')
    fixture.componentRef.setInput('hostId', 'project-1')
    fixture.componentRef.setInput('manifest', manifest())
    await flushRemoteEntry(fixture)
    const frame: HTMLIFrameElement = fixture.nativeElement.querySelector('iframe')
    const send = jest.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => undefined)
    const pending = fixture.componentInstance.prepareEditorClose('resource-1')
    const request = send.mock.calls.at(-1)![0]
    const acknowledge = (revision: unknown, source: Window | null = frame.contentWindow) => {
      window.dispatchEvent(
        new MessageEvent('message', {
          source,
          data: {
            channel: 'xpertai.remote_component',
            protocolVersion: 1,
            instanceId: fixture.componentInstance.instanceId(),
            scopeRevision: revision,
            type: 'closePrepared',
            requestId: request.requestId,
            ready: true
          }
        })
      )
    }
    return { fixture, pending, request, acknowledge }
  }

  it('rejects missing/stale scope and foreign frames before accepting close confirmation', async () => {
    const f = await setup(),
      closed = jest.fn()
    void f.pending.then(closed)
    f.acknowledge(undefined)
    f.acknowledge(f.request.scopeRevision - 1)
    f.acknowledge(f.request.scopeRevision, window)
    await Promise.resolve()
    expect(closed).not.toHaveBeenCalled()
    f.acknowledge(f.request.scopeRevision)
    await expect(f.pending).resolves.toBe(true)
    f.fixture.destroy()
  })

  it('cancels pending close confirmation when context changes or the frame is destroyed', async () => {
    const first = await setup()
    first.fixture.componentRef.setInput('runtimeScope', { projectId: 'project-2' })
    await flushRemoteEntry(first.fixture)
    await expect(first.pending).resolves.toBe(false)
    first.fixture.destroy()
    const second = await setup()
    second.fixture.destroy()
    await expect(second.pending).resolves.toBe(false)
  })
}
