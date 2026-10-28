import { signal } from '@angular/core'
import { HttpErrorResponse } from '@angular/common/http'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { of, Subject, throwError } from 'rxjs'
import type { ArtifactPresentation } from '@xpert-ai/contracts'
import { XpThemeService } from '@xpert-ai/headless-ui'
import { ArtifactPresentationService } from '@cloud/app/@core/services/artifact-presentation.service'
import { ArtifactPresentationComponent } from './artifact-presentation.component'
import { ArtifactSharePageComponent } from './artifact-share-page.component'

const presentation = (artifactId = 'artifact-1'): ArtifactPresentation => ({
  schemaVersion: 1,
  target: { artifactId, versionId: 'published-1' },
  title: artifactId,
  versionNumber: 1,
  readOnly: true,
  entry: { html: '<html><head></head><body>Viewer</body></html>' },
  data: { title: artifactId },
  operations: ['query']
})
const envelope = { channel: 'xpertai.remote_component', protocolVersion: 1 }

function frameWindow(fixture: ComponentFixture<ArtifactPresentationComponent>) {
  const frame = fixture.nativeElement.querySelector('iframe')
  if (!(frame instanceof HTMLIFrameElement) || !frame.contentWindow) throw new Error('Viewer frame is missing')
  expect(frame.getAttribute('sandbox')).toBe('allow-scripts')
  return frame.contentWindow
}

async function settle(fixture: ComponentFixture<ArtifactPresentationComponent>) {
  fixture.detectChanges()
  await fixture.whenStable()
  fixture.detectChanges()
}

function receive(source: Window, data: object) {
  window.dispatchEvent(new MessageEvent('message', { source, data: { ...envelope, ...data } }))
}

describe('Artifact presentation page boundary', () => {
  const read = jest.fn((_slug: string) => of(presentation()))
  const readSnapshot = jest.fn((_slug: string) => of(presentation()))
  const readLibraryPresentation = jest.fn((_id: string) => of(presentation()))
  const queryLibrary = jest.fn(() => of<object>({ rows: [] }))
  const query = jest.fn(() => of<object>({ rows: [] }))
  const themeClass = signal('light')

  beforeEach(() => {
    read.mockReset().mockImplementation(() => of(presentation()))
    readSnapshot.mockReset().mockImplementation(() => of(presentation()))
    query.mockReset().mockImplementation(() => of({ rows: [] }))
    readLibraryPresentation.mockReset().mockImplementation(() => of(presentation()))
    queryLibrary.mockReset().mockImplementation(() => of({ rows: [] }))
    themeClass.set('light')
    TestBed.configureTestingModule({
      imports: [ArtifactPresentationComponent, TranslateModule.forRoot()],
      providers: [
        {
          provide: ArtifactPresentationService,
          useValue: { read, readSnapshot, query, readLibraryPresentation, queryLibrary }
        },
        { provide: XpThemeService, useValue: { themeClass } },
        provideRouter([{ path: 'artifacts/view/:artifactLinkSlug', component: ArtifactSharePageComponent }])
      ]
    })
  })
  afterEach(() => TestBed.resetTestingModule())

  async function open(snapshot = false, library = false) {
    const fixture = TestBed.createComponent(ArtifactPresentationComponent)
    fixture.componentRef.setInput('slug', 'shared-one')
    fixture.componentRef.setInput('snapshot', snapshot)
    fixture.componentRef.setInput('library', library)
    await settle(fixture)
    const source = frameWindow(fixture)
    const post = jest.spyOn(source, 'postMessage')
    receive(source, { type: 'ready' })
    await settle(fixture)
    const init: unknown = post.mock.calls.at(-1)?.[0]
    if (!init || typeof init !== 'object' || !('instanceId' in init) || typeof init.instanceId !== 'string') {
      throw new Error('Viewer did not initialize')
    }
    post.mockClear()
    return { fixture, source, post, instanceId: init.instanceId }
  }

  it('opens a private reference and dispatches queries through its authenticated library endpoints', async () => {
    const { fixture, source, instanceId } = await open(false, true)
    expect(readLibraryPresentation).toHaveBeenCalledWith('shared-one')
    expect(read).not.toHaveBeenCalled()
    expect(readSnapshot).not.toHaveBeenCalled()
    receive(source, { type: 'executeAction', requestId: 'query', instanceId, actionKey: 'query', input: {} })
    await settle(fixture)
    expect(queryLibrary).toHaveBeenCalled()
    expect(query).not.toHaveBeenCalled()
  })

  it('renders snapshots through the public endpoint and never dispatches query actions', async () => {
    const { fixture, source, post, instanceId } = await open(true)
    expect(readSnapshot).toHaveBeenCalledWith('shared-one')
    expect(read).not.toHaveBeenCalled()
    receive(source, { type: 'executeAction', requestId: 'query', instanceId, actionKey: 'query', input: {} })
    await settle(fixture)
    expect(query).not.toHaveBeenCalled()
    expect(post).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'error' }), '*')
  })

  it('shows login for a restricted snapshot without rendering content', async () => {
    readSnapshot.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 401 })))
    const fixture = TestBed.createComponent(ArtifactPresentationComponent)
    fixture.componentRef.setInput('slug', 'shared-one')
    fixture.componentRef.setInput('snapshot', true)
    await settle(fixture)
    expect(fixture.componentInstance.signIn()).toBe(true)
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull()
    expect(fixture.nativeElement.querySelector('a')?.getAttribute('href')).toContain('/auth/login')
  })

  it('isolates source windows and instances and dispatches only declared operations against the server target', async () => {
    const { fixture, source, post, instanceId } = await open()
    const request = {
      type: 'executeAction',
      requestId: 'query-1',
      instanceId,
      actionKey: 'query',
      input: { controls: {} }
    }
    receive(window, request)
    receive(source, { ...request, instanceId: 'stale' })
    receive(source, { ...request, type: 'invokeClientCommand' })
    await settle(fixture)
    expect(query).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
    receive(source, { ...request, actionKey: 'save' })
    await settle(fixture)
    expect(query).not.toHaveBeenCalled()
    expect(post).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'error', requestId: 'query-1' }), '*')
    receive(source, request)
    await settle(fixture)
    expect(query).toHaveBeenCalledWith('shared-one', {
      target: presentation().target,
      operation: 'query',
      input: { controls: {} }
    })
    expect(post).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'actionResult', result: { success: true, data: { rows: [] } } }),
      '*'
    )
  })

  it('cancels old requests when the resource changes and never sends stale results to a replacement frame', async () => {
    const { fixture, source, post, instanceId } = await open()
    const pending = new Subject<object>()
    query.mockReturnValueOnce(pending)
    receive(source, { type: 'executeAction', requestId: 'old-query', instanceId, actionKey: 'query', input: {} })
    expect(pending.observed).toBe(true)
    read.mockReturnValueOnce(of(presentation('artifact-2')))
    fixture.componentRef.setInput('slug', 'shared-two')
    await settle(fixture)
    expect(pending.observed).toBe(false)
    pending.next({ private: 'old resource result' })
    expect(post).not.toHaveBeenCalled()
    expect(fixture.componentInstance.title()).toBe('artifact-2')
    expect(fixture.componentInstance.error()).toBe(false)
  })

  it('updates theme and locale without reloading data, and responds to a repeated ready handshake', async () => {
    const { fixture, source, post, instanceId } = await open()
    themeClass.set('dark')
    await settle(fixture)
    expect(post).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'init', instanceId, theme: expect.objectContaining({ mode: 'dark' }) }),
      '*'
    )
    TestBed.inject(TranslateService).use('zh-Hans')
    await settle(fixture)
    expect(post).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'init', instanceId, locale: 'zh-Hans' }), '*')
    post.mockClear()
    receive(source, { type: 'ready' })
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: 'init', instanceId }), '*')
    expect(read).toHaveBeenCalledTimes(1)
    expect(query).not.toHaveBeenCalled()
  })

  it('removes the viewer after access is denied and explicitly reauthorizes on reopen', async () => {
    const { fixture, source, instanceId } = await open()
    query.mockReturnValueOnce(throwError(() => new Error('access revoked')))
    receive(source, { type: 'executeAction', requestId: 'query-1', instanceId, actionKey: 'query', input: {} })
    await settle(fixture)
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull()
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull()
    fixture.componentInstance.reload()
    await settle(fixture)
    expect(read).toHaveBeenCalledTimes(2)
    expect(fixture.componentInstance.error()).toBe(false)
    frameWindow(fixture)
  })

  it('loads the new resource when Angular reuses the standalone route for a different share slug', async () => {
    const harness = await RouterTestingHarness.create()
    const first = await harness.navigateByUrl('/artifacts/view/shared-one', ArtifactSharePageComponent)
    harness.detectChanges()
    const second = await harness.navigateByUrl('/artifacts/view/shared-two', ArtifactSharePageComponent)
    harness.detectChanges()
    expect(second).toBe(first)
    expect(read.mock.calls.map((call) => call[0])).toEqual(['shared-one', 'shared-two'])
  })
})
