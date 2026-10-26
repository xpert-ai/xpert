import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { of, Subject, throwError } from 'rxjs'
import type { XpertExtensionViewManifest, XpertViewQuery } from '@xpert-ai/contracts'
import { createChatkitWorkbenchNavigation } from './chatkit-workbench-navigation'

const manifest: XpertExtensionViewManifest = {
  key: 'bid.view-provider__bid.studio',
  title: 'Bid',
  hostType: 'agent',
  slot: 'agent.workbench',
  source: { provider: 'bid' },
  view: {
    type: 'remote_component',
    runtime: 'react',
    protocolVersion: 1,
    component: { isolation: 'iframe', entry: 'test-view' },
    dataSource: { mode: 'platform' }
  },
  dataSource: { mode: 'platform' }
}
const view = {
  viewKey: manifest.key,
  selectionId: 'bid-b',
  parameters: { view: 'workflow', projectId: 'bid-b', mode: 'score', section: 'authoring', writingMode: 'directory' }
}
function setup() {
  const url = {
    viewClosed: signal(false),
    viewKey: signal<string | null>(null),
    viewLayout: signal<'split' | 'maximized' | null>(null),
    projectId: signal<string | null>(null),
    viewQuery: signal<XpertViewQuery | null>(null),
    setViewState: jest.fn(async () => true)
  }
  const options = {
    assistantId: signal<string | null>('assistant'),
    projectId: signal<string | null>('project-a'),
    routeKey: signal('assistant:project-a:thread-a'),
    defaultViewKey: signal<string | null>(null),
    isChatkitView: (key: string | null) => key === manifest.key,
    views: { getSlotViews: jest.fn(() => of([manifest])) },
    selectProject: jest.fn(async () => true),
    url
  }
  const navigation = TestBed.runInInjectionContext(() => createChatkitWorkbenchNavigation(options))
  TestBed.flushEffects()
  return { ...options, ...navigation }
}
afterEach(() => TestBed.resetTestingModule())

describe('ChatKit Workbench route ownership', () => {
  it('opens an authorized URL view maximized and persists a manual return to split layout', async () => {
    const h = setup()
    h.url.viewKey.set(manifest.key)
    h.url.viewLayout.set('maximized')
    expect(h.state().view).toEqual({ viewKey: manifest.key, layout: 'maximized' })
    await h.onNavigationChange({ projectId: 'project-a', view: { viewKey: manifest.key, layout: 'split' } })
    expect(h.url.setViewState).toHaveBeenCalledWith(manifest.key, {}, { closed: false, layout: 'split' })
    h.url.viewKey.set('unauthorized')
    expect(h.state().view).toBeNull()
  })
  it.each(['new-project', 'project-b'])(
    'opens %s atomically with the complete View query after target authorization',
    async (projectId) => {
      const h = setup()
      expect(await h.openProject({ projectId, view })).toBe(true)
      expect(h.views.getSlotViews).toHaveBeenCalledWith('agent', 'assistant', 'agent.workbench', {
        runtimeScope: { projectId }
      })
      expect(h.selectProject).toHaveBeenCalledTimes(1)
      expect(h.selectProject).toHaveBeenCalledWith(projectId, view)
      expect(h.url.setViewState).not.toHaveBeenCalled()
    }
  )

  it('keeps the conversation when reopening a View in the current Project', async () => {
    const h = setup()
    await h.openProject({ projectId: 'project-a', view })
    expect(h.selectProject).not.toHaveBeenCalled()
    expect(h.url.setViewState).toHaveBeenCalledWith(manifest.key, {
      selectionId: view.selectionId,
      parameters: view.parameters
    })
  })

  it('supplies refresh and Back/Forward state to ChatKit without creating details tabs', () => {
    const h = setup()
    h.url.viewKey.set(manifest.key)
    h.url.viewQuery.set({ selectionId: view.selectionId, parameters: view.parameters })
    expect(h.state()).toEqual({ projectId: 'project-a', view })
    h.projectId.set('project-b')
    h.url.viewQuery.set({ selectionId: 'bid-c', parameters: { section: 'review' } })
    expect(h.state()).toEqual({
      projectId: 'project-b',
      view: { viewKey: manifest.key, selectionId: 'bid-c', parameters: { section: 'review' } }
    })
    h.projectId.set('project-a')
    h.url.viewQuery.set({ selectionId: view.selectionId, parameters: view.parameters })
    expect(h.state()).toEqual({ projectId: 'project-a', view })
    expect(h.selectProject).not.toHaveBeenCalled()
  })

  it('does not reopen the configured default after an explicit URL dismissal', () => {
    const h = setup()
    h.defaultViewKey.set(manifest.key)
    expect(h.state().view?.viewKey).toBe(manifest.key)
    h.url.viewClosed.set(true)
    expect(h.state().view).toBeNull()
  })

  it('persists local navigation but ignores events from an old Project', async () => {
    const h = setup()
    await h.onNavigationChange({ projectId: 'project-a', view })
    expect(h.url.setViewState).toHaveBeenCalledWith(
      manifest.key,
      {
        selectionId: view.selectionId,
        parameters: view.parameters
      },
      { closed: false }
    )
    h.url.setViewState.mockClear()
    h.projectId.set('project-b')
    await h.onNavigationChange({ projectId: 'project-a', view })
    expect(h.url.setViewState).not.toHaveBeenCalled()
    await h.onNavigationChange({ projectId: 'project-b', view: null })
    expect(h.url.setViewState).toHaveBeenCalledWith(null, null, { closed: true })
  })

  it('clears a dismissed legacy View URL and refuses to reopen its unsupported renderer', async () => {
    const h = setup()
    h.defaultViewKey.set('other-plugin')
    expect(h.state().view).toBeNull()
    h.url.viewKey.set('other-plugin')
    h.url.viewQuery.set({ selectionId: 'document' })
    expect(h.state().view).toBeNull()
    await h.onNavigationChange({ projectId: 'project-a', view: null })
    expect(h.url.setViewState).toHaveBeenCalledWith(null, null, { closed: true })
    h.url.setViewState.mockClear()
    await h.onNavigationChange({ projectId: 'project-a', view: { viewKey: 'other-plugin' } })
    expect(h.url.setViewState).not.toHaveBeenCalled()
  })

  it('rejects hidden, missing and inaccessible targets without navigating', async () => {
    const h = setup()
    for (const manifests of [
      [],
      [{ ...manifest, visible: false }],
      [{ ...manifest, view: { type: 'raw_json' as const } }]
    ]) {
      h.views.getSlotViews.mockReturnValueOnce(of(manifests))
      await expect(h.openProject({ projectId: 'project-b', view })).rejects.toThrow('not available')
    }
    h.views.getSlotViews.mockReturnValueOnce(throwError(() => new Error('Forbidden')))
    await expect(h.openProject({ projectId: 'project-b', view })).rejects.toThrow('Forbidden')
    expect(h.selectProject).not.toHaveBeenCalled()
    expect(h.url.setViewState).not.toHaveBeenCalled()
  })

  it('ignores a late authorization response after another navigation', async () => {
    const h = setup()
    const late = new Subject<XpertExtensionViewManifest[]>()
    h.views.getSlotViews.mockReturnValueOnce(late)
    const first = h.openProject({ projectId: 'project-b', view })
    await h.openProject({ projectId: 'project-c', view })
    late.next([manifest])
    expect(await first).toBe(false)
    expect(h.selectProject).toHaveBeenCalledTimes(1)
    expect(h.selectProject).toHaveBeenCalledWith('project-c', view)
  })

  it('returns cancelled navigation instead of reporting success', async () => {
    const h = setup()
    h.selectProject.mockResolvedValueOnce(false)
    expect(await h.openProject({ projectId: 'project-b', view })).toBe(false)
  })
})
