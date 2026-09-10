import { signal } from '@angular/core'
import { Dialog } from '@angular/cdk/dialog'
import { OverlayContainer } from '@angular/cdk/overlay'
import { ComponentFixture, DeferBlockBehavior, TestBed } from '@angular/core/testing'
import { provideNoopAnimations } from '@angular/platform-browser/animations'
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  KnowledgeWikiPageListItem,
  KnowledgeWikiRecoveryAction,
  KnowledgeWikiStatusResponse
} from '@xpert-ai/contracts'
import { BehaviorSubject, of, Subject } from 'rxjs'
import { KnowledgeWikiService, ToastrService } from '../../../../../@core'
import { KnowledgebaseComponent } from '../knowledgebase.component'
import { KnowledgeWikiComponent } from './wiki.component'
import { WikiGraphComponent } from './wiki-graph.component'

jest.mock('@milkdown/crepe', () => ({ Crepe: jest.fn() }))
jest.mock('mermaid', () => ({ initialize: jest.fn(), render: jest.fn() }))
jest.mock('@xterm/xterm', () => ({ Terminal: jest.fn() }))

describe('Wiki recovery messages', () => {
  let fixture: ComponentFixture<KnowledgeWikiComponent>
  const service = {
    getGraph: jest.fn(() => of({ nodes: [], edges: [], truncated: false })),
    getTaxonomy: jest.fn(() => of({ enabled: false, revision: 0, folders: [], total: 0, unclassifiedCount: 0 })),
    getClassificationStatus: jest.fn(() => of({ activeJobs: 0 })),
    getStatus: jest.fn(),
    getPages: jest.fn(() => of({ items: [], total: 0 })),
    getClassifications: jest.fn(() => of([])),
    classify: jest.fn(),
    retryJob: jest.fn(() => of({})),
    rebuild: jest.fn(() => of({}))
  }

  async function render(
    reconciliationStatus: KnowledgeWikiRecoveryAction['reconciliationStatus'],
    failureReason?: 'request_rejected'
  ) {
    const action: KnowledgeWikiRecoveryAction = {
      jobId: 'job-1',
      invocationId: 'invocation-1',
      reconciliationStatus,
      ...(failureReason ? { failureReason } : {}),
      canRetry: reconciliationStatus !== 'pending',
      inputCurrent: true,
      requiresAdditionalChargeConfirmation: reconciliationStatus === 'indeterminate',
      recommendedAction: reconciliationStatus === 'pending' ? 'wait' : 'retry_job'
    }
    const status: KnowledgeWikiStatusResponse = {
      canManage: true,
      enabled: true,
      status: 'failed',
      availability: 'unavailable',
      readyPageCount: 0,
      requiresManagement: true,
      activeRevision: 0,
      stagedRevision: null,
      generationJobs: { queued: 0, running: 0, failed: 1 },
      pages: { ready: 0, stale: 0, failed: 0, archived: 0, projectionFailed: 0 },
      indeterminateInvocationCount: reconciliationStatus === 'indeterminate' ? 1 : 0,
      billingRecoveryCount: 0,
      cleanupPendingCount: 0,
      cleanupFailedCount: 0,
      recoveryActions: [action]
    }
    service.getStatus.mockReturnValue(of(status))
    await TestBed.configureTestingModule({
      imports: [KnowledgeWikiComponent, TranslateModule.forRoot()],
      deferBlockBehavior: DeferBlockBehavior.Playthrough,
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: KnowledgeWikiService, useValue: service },
        {
          provide: KnowledgebaseComponent,
          useValue: { paramId: signal('kb-1'), knowledgebase: signal(undefined), documentNum: signal(2) }
        },
        { provide: ToastrService, useValue: { danger: jest.fn() } }
      ]
    })
      .overrideComponent(WikiGraphComponent, { set: { template: '' } })
      .compileComponents()
    TestBed.inject(TranslateService).setTranslation('en', {
      XP: {
        Knowledgebase: {
          Wiki: {
            RequestNotSent: 'No generation request was sent. Retry after fixing the model settings.',
            RequestRejected: 'The provider rejected the request. Retry after fixing its parameters.',
            Indeterminate: 'The provider outcome is uncertain and a retry may add a charge.',
            Reconciling: 'Checking the model provider outcome...'
          }
        },
        ACTIONS: { Retry: 'Retry' }
      }
    })
    TestBed.inject(TranslateService).use('en')
    fixture = TestBed.createComponent(KnowledgeWikiComponent)
    fixture.autoDetectChanges()
    await fixture.componentInstance.refresh()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await fixture.whenStable()
    fixture.detectChanges()
    return fixture.nativeElement as HTMLElement
  }

  afterEach(() => {
    fixture?.destroy()
    TestBed.inject(OverlayContainer).ngOnDestroy()
    jest.restoreAllMocks()
    service.retryJob.mockClear()
    service.rebuild.mockClear()
    TestBed.resetTestingModule()
  })

  it('shows a no-request message and retries without a duplicate-charge confirmation', async () => {
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false)
    const root = await render('not_executed')
    expect(root.textContent).toContain('No generation request was sent')
    expect(root.textContent).not.toContain('a retry may add a charge')
    Array.from(root.querySelectorAll('button'))
      .find((button) => button.textContent.trim() === 'Retry')
      .click()
    await fixture.whenStable()
    expect(confirm).not.toHaveBeenCalled()
    expect(service.retryJob).toHaveBeenCalledWith('kb-1', 'job-1', false)
  })

  it('offers only knowledge and summaries and applies the same group to pages and directory counts', async () => {
    const root = await render('not_executed')
    const tabs = Array.from(root.querySelectorAll('aside header button')).filter((button) =>
      button.textContent.includes('Wiki.PageGroup.')
    )
    expect(tabs.map((button) => button.textContent.trim())).toEqual([
      'XP.Knowledgebase.Wiki.PageGroup.knowledge',
      'XP.Knowledgebase.Wiki.PageGroup.summary'
    ])
    ;(tabs[1] as HTMLButtonElement).click()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(fixture.componentInstance.pageGroup()).toBe('summary')
    expect(service.getPages).toHaveBeenLastCalledWith('kb-1', expect.objectContaining({ pageGroup: 'summary' }))
    expect(service.getTaxonomy).toHaveBeenLastCalledWith('kb-1', expect.objectContaining({ pageGroup: 'summary' }))
  })

  it('releases the reading sidebar for the graph and restores it when returning to read', async () => {
    const root = await render('not_executed')
    expect(root.querySelector('z-tree')).not.toBeNull()
    fixture.componentInstance.view.set('graph')
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    expect(root.querySelector('z-tree')).toBeNull()
    expect(root.querySelector('xp-wiki-graph')).not.toBeNull()
    fixture.componentInstance.view.set('read')
    fixture.detectChanges()
    expect(root.querySelector('z-tree')).not.toBeNull()
  })

  it('places classified pages inside their directory in the same navigation tree', async () => {
    const root = await render('not_executed')
    fixture.componentInstance.taxonomy.set({
      enabled: false,
      revision: 1,
      total: 1,
      unclassifiedCount: 0,
      folders: [
        { id: 'folder-1', parentId: null, name: 'Operations', description: '', position: 0, version: 1, pageCount: 1 }
      ]
    })
    fixture.componentInstance.pages.set([
      {
        id: 'page-1',
        pageKey: 'concept:page-1',
        pageType: 'concept',
        canonicalName: 'Runbook',
        title: 'Runbook',
        slug: 'runbook',
        summary: 'Operations instructions',
        status: 'ready',
        projectionStatus: 'ready',
        updatedAt: '',
        placement: { folderId: 'folder-1', source: 'automatic', version: 1 }
      }
    ])
    fixture.detectChanges()
    await new Promise((resolve) => setTimeout(resolve, 0))
    fixture.detectChanges()
    expect(
      root.querySelector('z-tree-node[data-key="folder:folder-1"] z-tree-node[data-key="page:page-1"]')
    ).not.toBeNull()
    expect(root.querySelector('aside')?.textContent).not.toContain('Operations instructions')
  })

  it.each(['read', 'graph'] as const)(
    'starts classification from a loading, disabled button without opening a dialog in the %s view',
    async (view) => {
      const root = await render('not_executed')
      fixture.componentInstance.view.set(view)
      fixture.detectChanges()
      const dialog = jest.spyOn(TestBed.inject(Dialog), 'open')
      const pending = new Subject<{ runId: string; count: number; truncated: boolean }>()
      service.classify.mockClear().mockReturnValue(pending)
      const router = jest.spyOn(TestBed.inject(Router), 'navigate')
      const button = Array.from(root.querySelectorAll('button')).find((item) =>
        item.textContent.includes('XP.Knowledgebase.Wiki.Organization.Classification')
      )
      button.click()
      fixture.detectChanges()
      expect(button.disabled).toBe(true)
      expect(button.querySelector('.animate-spin')).not.toBeNull()
      button.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
      await fixture.whenStable()
      expect(dialog).not.toHaveBeenCalled()
      expect(service.classify).toHaveBeenCalledTimes(1)
      expect(service.classify).toHaveBeenCalledWith('kb-1')
      expect(fixture.componentInstance.view()).toBe(view)
      expect(router).not.toHaveBeenCalled()
      expect(!!root.querySelector('z-tree')).toBe(view === 'read')
    }
  )

  it.each(['z-cancel-button', 'z-close-header-button'])(
    'does not retry an uncertain provider outcome after dismissing the dialog with %s',
    async (dismissal) => {
      const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false)
      const root = await render('indeterminate')
      expect(root.textContent).toContain('a retry may add a charge')
      Array.from(root.querySelectorAll('button'))
        .find((button) => button.textContent.trim() === 'Retry')
        .click()
      fixture.detectChanges()
      const overlay = TestBed.inject(OverlayContainer).getContainerElement()
      expect(confirm).not.toHaveBeenCalled()
      expect(overlay.textContent).toContain('XP.Knowledgebase.Wiki.RetryChargeConfirm')
      overlay.querySelector<HTMLButtonElement>(`[data-testid="${dismissal}"]`).click()
      await fixture.whenStable()
      expect(service.retryJob).not.toHaveBeenCalled()
    }
  )

  it('authorizes one paid retry only after accepting the dialog', async () => {
    await render('indeterminate')
    jest.spyOn(window, 'confirm').mockReturnValue(false)
    const component = fixture.componentInstance
    const action = component.recoveryActions()[0]
    const response = new Subject<object>()
    service.retryJob.mockReturnValueOnce(response)
    const pending = component.retry(action)
    await component.retry(action)
    fixture.detectChanges()
    const overlay = TestBed.inject(OverlayContainer).getContainerElement()
    expect(overlay.querySelectorAll('z-dialog')).toHaveLength(1)
    expect(service.retryJob).not.toHaveBeenCalled()
    overlay.querySelector<HTMLButtonElement>('[data-testid="z-ok-button"]').click()
    await fixture.whenStable()
    await component.retry(action)
    expect(service.retryJob).toHaveBeenCalledTimes(1)
    expect(service.retryJob).toHaveBeenCalledWith('kb-1', 'job-1', true)
    response.next({})
    response.complete()
    await pending
  })

  it.each([false, true])('requires dialog approval before a full rebuild (approved: %s)', async (approved) => {
    await render('indeterminate')
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false)
    const component = fixture.componentInstance
    const action = { ...component.recoveryActions()[0], recommendedAction: 'full_rebuild' as const }
    const pending = component.retry(action)
    await component.rebuild()
    fixture.detectChanges()
    const overlay = TestBed.inject(OverlayContainer).getContainerElement()
    expect(overlay.querySelectorAll('z-dialog')).toHaveLength(1)
    expect(overlay.textContent).toContain('XP.Knowledgebase.Wiki.RebuildConfirm')
    expect(confirm).not.toHaveBeenCalled()
    expect(service.rebuild).not.toHaveBeenCalled()
    overlay.querySelector<HTMLButtonElement>(`[data-testid="z-${approved ? 'ok' : 'cancel'}-button"]`).click()
    await pending
    await fixture.whenStable()
    if (approved) {
      expect(service.rebuild).toHaveBeenCalledWith('kb-1', {
        confirmModelCharges: true,
        maxModelInvocations: 40,
        maxEstimatedTokens: 400_000
      })
    } else {
      expect(service.rebuild).not.toHaveBeenCalled()
    }
    expect(component.rebuilding()).toBe(false)
  })

  it('distinguishes provider rejection from a request that was not sent', async () => {
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false)
    const root = await render('not_executed', 'request_rejected')
    expect(root.textContent).toContain('The provider rejected the request')
    expect(root.textContent).not.toContain('No generation request was sent')
    expect(root.textContent).not.toContain('a retry may add a charge')
    Array.from(root.querySelectorAll('button'))
      .find((button) => button.textContent.trim() === 'Retry')
      .click()
    await fixture.whenStable()
    expect(confirm).not.toHaveBeenCalled()
    expect(service.retryJob).toHaveBeenCalledWith('kb-1', 'job-1', false)
  })
})

describe('Wiki related-page navigation', () => {
  function page(id: string): KnowledgeWikiPageListItem {
    return {
      id,
      pageKey: `concept:${id}`,
      pageType: 'concept',
      canonicalName: id,
      title: id,
      slug: id,
      summary: '',
      status: 'ready',
      projectionStatus: 'ready',
      updatedAt: '2026-09-07T00:00:00Z'
    }
  }

  async function setup(listSize: number) {
    const params = new BehaviorSubject(convertToParamMap({ wikiPageId: 'A', section: 'old-section' }))
    const route = { queryParamMap: params, snapshot: { queryParamMap: params.value } }
    const router = {
      url: '/wiki?wikiPageId=A&section=old-section',
      navigate: jest.fn(async (_commands: unknown[], options: { queryParams: { wikiPageId?: string } }) => {
        if (options.queryParams.wikiPageId) {
          router.url = `/wiki?wikiPageId=${options.queryParams.wikiPageId}`
          route.snapshot.queryParamMap = convertToParamMap({ wikiPageId: options.queryParams.wikiPageId })
          params.next(route.snapshot.queryParamMap)
        }
        return true
      })
    }
    const service = {
      getTaxonomy: jest.fn(() => of({ enabled: false, revision: 0, folders: [], total: 0, unclassifiedCount: 0 })),
      getStatus: jest.fn(() => of({ enabled: true, status: 'ready' })),
      getPages: jest.fn(() =>
        of({ items: Array.from({ length: listSize }, (_, i) => page(i ? `page-${i}` : 'A')), total: 60 })
      ),
      getPage: jest.fn((_kb: string, id: string) =>
        of({ ...page(id), markdown: '', links: [], backlinks: [], evidence: [] })
      )
    }
    await TestBed.configureTestingModule({
      imports: [KnowledgeWikiComponent, TranslateModule.forRoot()],
      providers: [
        { provide: KnowledgeWikiService, useValue: service },
        { provide: KnowledgebaseComponent, useValue: { paramId: signal('kb'), knowledgebase: signal(undefined) } },
        { provide: ToastrService, useValue: { danger: jest.fn() } },
        { provide: ActivatedRoute, useValue: route },
        { provide: Router, useValue: router }
      ]
    })
      .overrideComponent(KnowledgeWikiComponent, {
        set: {
          template:
            '<xp-wiki-page-tree #directoryTree [id]="knowledgebaseId()" [taxonomy]="taxonomy()" [pages]="pages()" [selectedPage]="selectedPage()" [folderId]="folderId()" />'
        }
      })
      .compileComponents()
    const fixture = TestBed.createComponent(KnowledgeWikiComponent)
    fixture.autoDetectChanges()
    await fixture.whenStable()
    await fixture.componentInstance.refresh()
    await new Promise((resolve) => setTimeout(resolve, 0))
    return { fixture, router, route, service }
  }

  afterEach(() => TestBed.resetTestingModule())

  it.each([1, 50])(
    'keeps the URL, reload, and evidence return aligned for a page outside a %i-item list',
    async (size) => {
      const { fixture, router, route, service } = await setup(size)
      fixture.componentInstance.openLinkedPage('B')
      await new Promise((resolve) => setTimeout(resolve, 0))
      await fixture.whenStable()
      expect(router.navigate).toHaveBeenCalledWith([], {
        relativeTo: route,
        queryParams: { wikiPageId: 'B', section: null },
        queryParamsHandling: 'merge',
        replaceUrl: true
      })
      expect(fixture.componentInstance.selectedPage()?.id).toBe('B')
      fixture.componentInstance.openEvidence('document', 'chunk')
      expect(router.navigate).toHaveBeenLastCalledWith(['/xpert/knowledges', 'kb', 'documents', 'document'], {
        queryParams: { chunkId: 'chunk', returnTo: '/wiki?wikiPageId=B' }
      })
      fixture.destroy()
      service.getPage.mockClear()
      const reloaded = TestBed.createComponent(KnowledgeWikiComponent)
      reloaded.autoDetectChanges()
      await reloaded.componentInstance.refresh()
      await new Promise((resolve) => setTimeout(resolve, 0))
      await reloaded.whenStable()
      expect(service.getPage).toHaveBeenCalledWith('kb', 'B')
      expect(reloaded.componentInstance.selectedPage()?.id).toBe('B')
    }
  )

  it('uses the same navigation for a listed page', async () => {
    const { fixture, router } = await setup(1)
    await fixture.componentInstance.selectPage(page('A'))
    expect(router.url).toBe('/wiki?wikiPageId=A')
    expect(fixture.componentInstance.selectedPage()?.id).toBe('A')
  })
  it('returns legacy classification URLs to reading while preserving the other query parameters', async () => {
    const { fixture, router, route } = await setup(1)
    route.queryParamMap.next(convertToParamMap({ wikiView: 'classification', wikiPageId: 'A' }))
    await fixture.whenStable()
    expect(fixture.componentInstance.view()).toBe('read')
    expect(router.navigate).toHaveBeenLastCalledWith([], {
      relativeTo: route,
      queryParams: { wikiView: 'read' },
      queryParamsHandling: 'merge',
      replaceUrl: true
    })
    expect(fixture.componentInstance.selectedPage()?.id).toBe('A')
  })
  it('loads global tree pages with the type filter independently of the expanded directory', async () => {
    const { fixture, service } = await setup(50)
    const component = fixture.componentInstance
    component.folderId.set('folder-1')
    component.pageGroup.set('knowledge')
    service.getPages.mockReturnValueOnce(of({ items: [page('next')], total: 51 }))
    await component.loadPages(true)
    expect(service.getPages).toHaveBeenLastCalledWith(
      'kb',
      expect.objectContaining({ pageGroup: 'knowledge', take: 50, skip: 50 })
    )
    expect(component.pages()).toHaveLength(51)
    expect(component.pages()[50].id).toBe('next')
  })

  it('ignores an older list response after the search changes', async () => {
    const { fixture, service } = await setup(1)
    const component = fixture.componentInstance
    const delayed = new Subject<{ items: KnowledgeWikiPageListItem[]; total: number }>()
    service.getPages.mockReturnValueOnce(delayed)
    const first = component.loadPages()
    component.appliedSearch.set('current')
    service.getPages.mockReturnValueOnce(of({ items: [page('current')], total: 1 }))
    await component.loadPages()
    delayed.next({ items: [page('obsolete')], total: 1 })
    delayed.complete()
    await first
    expect(component.pages().map((item) => item.id)).toEqual(['current'])
    expect(service.getPages).toHaveBeenLastCalledWith('kb', expect.objectContaining({ search: 'current', skip: 0 }))
  })

  it('expands the selected page ancestry and preserves folder selection in route parameters', async () => {
    const { fixture, router, route } = await setup(1)
    const component = fixture.componentInstance
    component.taxonomy.set({
      enabled: false,
      revision: 2,
      unclassifiedCount: 0,
      total: 1,
      folders: [
        { id: 'root', parentId: null, name: 'Root', description: '', position: 0, version: 1, pageCount: 0 },
        { id: 'child', parentId: 'root', name: 'Child', description: '', position: 0, version: 1, pageCount: 1 }
      ]
    })
    component.selectedPage.set({
      ...page('A'),
      markdown: '',
      links: [],
      backlinks: [],
      evidence: [],
      placement: { folderId: 'child', source: 'manual', version: 1 }
    })
    fixture.detectChanges()
    await fixture.whenStable()
    expect(component.directoryTree()?.tree()?.treeService.isExpanded('folder:root')).toBe(true)
    expect(component.pageFolderPath()).toBe('Root / Child')
    await component.setFolder('child')
    expect(router.navigate).toHaveBeenLastCalledWith([], {
      relativeTo: route,
      queryParams: { wikiFolderId: 'child', wikiView: 'read' },
      queryParamsHandling: 'merge',
      replaceUrl: true
    })
  })
})
