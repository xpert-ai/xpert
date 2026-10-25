import { TestBed } from '@angular/core/testing'
import { Subject, throwError } from 'rxjs'
import { XpertExtensionViewManifest } from '@xpert-ai/contracts'
import { RemoteComponentRendererComponent } from './remote-component-renderer.component'

type FixtureDependencies = {
  api: {
    createViewFileAccessSession: jest.Mock
    createViewFileAccessGrant: jest.Mock
    readViewFileAccessContent: jest.Mock
    revokeViewFileAccessSession: jest.Mock
  }
  manifest: XpertExtensionViewManifest
}

export function registerFileAccessTests(
  dependencies: () => FixtureDependencies,
  flushRemoteEntry: (fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) => Promise<void>
) {
  it('returns authorized download bytes as a data URL instead of a partitioned parent blob URL', async () => {
    const { api, manifest } = dependencies()
    const fixture = TestBed.createComponent(RemoteComponentRendererComponent)
    fixture.componentRef.setInput('hostType', 'agent')
    fixture.componentRef.setInput('hostId', 'assistant-1')
    fixture.componentRef.setInput('manifest', { ...manifest, fileAccess: { purposes: ['download'] } })
    await flushRemoteEntry(fixture)
    const component = fixture.componentInstance as unknown as {
      handleFileAccessRequest(message: { fileKey: string; targetId: string; purpose: string }): Promise<unknown>
    }
    const count = jest.mocked(URL.createObjectURL).mock.calls.length
    await expect(
      component.handleFileAccessRequest({ fileKey: 'asset-1', targetId: 'task-1', purpose: 'download' })
    ).resolves.toMatchObject({
      fileName: 'video.mp4',
      url: 'data:video/mp4;base64,ZmlsZSBieXRlcw=='
    })
    expect(api.createViewFileAccessGrant).toHaveBeenCalledWith('session-1', {
      fileKey: 'asset-1',
      targetId: 'task-1',
      purpose: 'download'
    })
    expect(api.readViewFileAccessContent).toHaveBeenCalledTimes(1)
    expect(URL.createObjectURL).toHaveBeenCalledTimes(count)
    fixture.destroy()
  })

  it('creates one host-bound file session and grants only declared purposes', async () => {
    const { api, manifest } = dependencies()
    const fixture = TestBed.createComponent(RemoteComponentRendererComponent)
    fixture.componentRef.setInput('hostType', 'agent')
    fixture.componentRef.setInput('hostId', 'assistant-1')
    fixture.componentRef.setInput('manifest', {
      ...manifest,
      fileAccess: { purposes: ['preview'] }
    })
    await flushRemoteEntry(fixture)

    const component = fixture.componentInstance as unknown as {
      handleFileAccessRequest(message: Record<string, unknown>): Promise<unknown>
    }
    await expect(
      component.handleFileAccessRequest({
        fileKey: 'asset-1',
        targetId: 'project-1',
        purpose: 'preview'
      })
    ).resolves.toMatchObject({ mimeType: 'video/mp4', size: 1024, url: expect.stringMatching(/^blob:/) })
    await component.handleFileAccessRequest({ fileKey: 'asset-2', targetId: 'project-1', purpose: 'preview' })

    expect(api.createViewFileAccessSession).toHaveBeenCalledTimes(1)
    expect(api.createViewFileAccessSession).toHaveBeenCalledWith('agent', 'assistant-1', manifest.key, undefined)
    expect(api.createViewFileAccessGrant).toHaveBeenNthCalledWith(1, 'session-1', {
      fileKey: 'asset-1',
      targetId: 'project-1',
      purpose: 'preview'
    })
    await expect(component.handleFileAccessRequest({ fileKey: 'asset-1', purpose: 'download' })).rejects.toThrow(
      "File access purpose 'download' is not available"
    )
    expect(api.createViewFileAccessGrant).toHaveBeenCalledTimes(2)

    expect(api.readViewFileAccessContent).toHaveBeenCalledTimes(2)
    const blobUrls = jest.mocked(URL.createObjectURL).mock.results.map((result) => result.value)
    fixture.destroy()
    for (const url of blobUrls) expect(URL.revokeObjectURL).toHaveBeenCalledWith(url)
    await Promise.resolve()
    expect(api.revokeViewFileAccessSession).toHaveBeenCalledWith('session-1')
  })

  it('propagates content denial without handing a public URL to the iframe', async () => {
    const { api, manifest } = dependencies()
    const fixture = TestBed.createComponent(RemoteComponentRendererComponent)
    fixture.componentRef.setInput('hostType', 'agent')
    fixture.componentRef.setInput('hostId', 'assistant-1')
    fixture.componentRef.setInput('manifest', { ...manifest, fileAccess: { purposes: ['preview'] } })
    await flushRemoteEntry(fixture)
    api.readViewFileAccessContent.mockReturnValueOnce(throwError(() => new Error('Forbidden')))
    const count = jest.mocked(URL.createObjectURL).mock.calls.length
    const component = fixture.componentInstance as unknown as {
      handleFileAccessRequest(message: { fileKey: string; purpose: string }): Promise<unknown>
    }
    await expect(component.handleFileAccessRequest({ fileKey: 'image', purpose: 'preview' })).rejects.toThrow(
      'Forbidden'
    )
    expect(URL.createObjectURL).toHaveBeenCalledTimes(count)
    fixture.destroy()
  })

  it('cancels in-flight bytes and creates no image URL after the view is destroyed', async () => {
    const { api, manifest } = dependencies()
    const fixture = TestBed.createComponent(RemoteComponentRendererComponent)
    fixture.componentRef.setInput('hostType', 'agent')
    fixture.componentRef.setInput('hostId', 'assistant-1')
    fixture.componentRef.setInput('manifest', { ...manifest, fileAccess: { purposes: ['preview'] } })
    await flushRemoteEntry(fixture)
    const bytes = new Subject<Blob>()
    api.readViewFileAccessContent.mockReturnValueOnce(bytes)
    const component = fixture.componentInstance as unknown as {
      handleFileAccessRequest(message: { fileKey: string; purpose: string }): Promise<unknown>
    }
    const result = component.handleFileAccessRequest({ fileKey: 'image', purpose: 'preview' })
    const assertion = expect(result).rejects.toThrow()
    for (let i = 0; i < 6; i++) await Promise.resolve()
    expect(bytes.observed).toBe(true)
    const count = jest.mocked(URL.createObjectURL).mock.calls.length
    fixture.destroy()
    await assertion
    expect(bytes.observed).toBe(false)
    expect(URL.createObjectURL).toHaveBeenCalledTimes(count)
  })
}
