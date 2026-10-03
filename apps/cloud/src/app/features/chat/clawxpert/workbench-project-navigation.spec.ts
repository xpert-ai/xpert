import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { of, Subject, throwError } from 'rxjs'
import type { XpertExtensionViewManifest, XpertViewQuery } from '@xpert-ai/contracts'
import type { ClawXpertWorkspaceTab } from './conversation-detail/workspace/tabs'
import { createWorkbenchProjectNavigation } from './workbench-project-navigation'

const manifest: XpertExtensionViewManifest = {
  key: 'provider__timeline',
  title: 'Tasks',
  hostType: 'agent',
  slot: 'agent.workbench.fixed',
  source: { provider: 'provider' },
  view: { type: 'table' },
  dataSource: { mode: 'platform' }
}
const request = {
  projectId: 'project-b',
  view: { viewKey: manifest.key, selectionId: 'task-b', parameters: { tab: 'tasks' } }
}
function setup() {
  const url = {
    viewKey: signal<string | null>(null),
    projectId: signal<string | null>(null),
    viewQuery: signal<XpertViewQuery | null>(null)
  }
  const options = {
    hostId: signal<string | null>('assistant'),
    routeKey: signal('assistant:project-a:thread-a'),
    language: () => 'en',
    views: { getSlotViews: jest.fn(() => of([manifest])) },
    tabs: signal<ClawXpertWorkspaceTab[]>([]),
    activate: jest.fn(),
    selectProject: jest.fn(async () => false),
    url,
    onError: jest.fn()
  }
  const navigation = TestBed.runInInjectionContext(() => createWorkbenchProjectNavigation(options))
  TestBed.flushEffects()
  return { ...options, ...navigation }
}
afterEach(() => TestBed.resetTestingModule())

describe('project View navigation without switching chat', () => {
  it('opens a scoped tab and leaves chat navigation untouched', async () => {
    const h = setup()
    expect(await h.open(request)).toBe(true)
    expect(h.selectProject).not.toHaveBeenCalled()
    expect(h.routeKey()).toBe('assistant:project-a:thread-a')
    expect(h.views.getSlotViews).toHaveBeenCalledWith('agent', 'assistant', 'agent.workbench.fixed', {
      runtimeScope: { projectId: 'project-b' }
    })
    expect(h.tabs()[0]).toMatchObject({
      projectScope: { projectId: 'project-b' },
      viewKey: manifest.key,
      query: { selectionId: 'task-b', parameters: { tab: 'tasks' } }
    })
  })
  it('reuses the same project tab and keeps different project scopes separate', async () => {
    const h = setup()
    await h.open(request)
    await h.open({ ...request, view: { viewKey: manifest.key, selectionId: 'next-task' } })
    expect(h.tabs()).toHaveLength(1)
    await h.open({ ...request, projectId: 'project-c' })
    expect(h.tabs()).toHaveLength(2)
    expect(h.tabs()[0].id).not.toBe(h.tabs()[1].id)
    expect(h.selectProject).not.toHaveBeenCalled()
  })
  it('resolves a unique view alias', async () => {
    const h = setup()
    await h.open({ ...request, view: { viewKey: 'timeline' } })
    expect(h.tabs()[0]).toMatchObject({ viewKey: manifest.key })
  })
  it('rejects missing, hidden and inaccessible views before opening', async () => {
    const h = setup()
    for (const views of [[], [{ ...manifest, visible: false }]]) {
      h.views.getSlotViews.mockReturnValueOnce(of(views))
      await expect(h.open(request)).rejects.toThrow('not available')
    }
    h.views.getSlotViews.mockReturnValueOnce(throwError(() => new Error('Forbidden')))
    await expect(h.open(request)).rejects.toThrow('Forbidden')
    expect(h.tabs()).toEqual([])
    expect(h.activate).not.toHaveBeenCalled()
    expect(h.selectProject).not.toHaveBeenCalled()
  })
  it('does not open a late response after the chat route changes', async () => {
    const h = setup(),
      pending = new Subject<XpertExtensionViewManifest[]>()
    h.views.getSlotViews.mockReturnValueOnce(pending)
    const opened = h.open(request)
    h.routeKey.set('assistant:project-a:thread-new')
    pending.next([manifest])
    expect(await opened).toBe(false)
    expect(h.tabs()).toEqual([])
  })
  it('restores a scoped View from the URL without navigating the chat or adding history', async () => {
    const h = setup()
    h.url.projectId.set(request.projectId)
    h.url.viewKey.set(manifest.key)
    h.url.viewQuery.set({ selectionId: 'task-b' })
    TestBed.flushEffects()
    await Promise.resolve()
    expect(h.tabs()[0]).toMatchObject({ projectScope: { projectId: 'project-b' }, query: { selectionId: 'task-b' } })
    expect(h.activate).toHaveBeenCalledWith(h.tabs()[0].id, 'none')
    expect(h.selectProject).not.toHaveBeenCalled()
  })
  it('keeps explicit workspace selection without a View compatible', async () => {
    const h = setup()
    expect(await h.open({ projectId: 'project-b' })).toBe(false)
    expect(h.selectProject).toHaveBeenCalledWith('project-b')
    expect(h.tabs()).toEqual([])
  })
})
