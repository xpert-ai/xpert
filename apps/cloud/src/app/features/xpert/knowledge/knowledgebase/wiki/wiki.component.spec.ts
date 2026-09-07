import { signal } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideNoopAnimations } from '@angular/platform-browser/animations'
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  KnowledgeWikiPageListItem,
  KnowledgeWikiRecoveryAction,
  KnowledgeWikiStatusResponse
} from '@xpert-ai/contracts'
import { BehaviorSubject, of } from 'rxjs'
import { KnowledgeWikiService, ToastrService } from '../../../../../@core'
import { KnowledgebaseComponent } from '../knowledgebase.component'
import { KnowledgeWikiComponent } from './wiki.component'

jest.mock('@milkdown/crepe', () => ({ Crepe: jest.fn() }))
jest.mock('mermaid', () => ({ initialize: jest.fn(), render: jest.fn() }))
jest.mock('@xterm/xterm', () => ({ Terminal: jest.fn() }))

describe('Wiki recovery messages', () => {
  let fixture: ComponentFixture<KnowledgeWikiComponent>
  const service = {
    getStatus: jest.fn(),
    getPages: jest.fn(() => of({ items: [], total: 0 })),
    retryJob: jest.fn(() => of({}))
  }

  async function render(reconciliationStatus: KnowledgeWikiRecoveryAction['reconciliationStatus']) {
    const action: KnowledgeWikiRecoveryAction = {
      jobId: 'job-1',
      invocationId: 'invocation-1',
      reconciliationStatus,
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
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: KnowledgeWikiService, useValue: service },
        { provide: KnowledgebaseComponent, useValue: { paramId: signal('kb-1') } },
        { provide: ToastrService, useValue: { danger: jest.fn() } }
      ]
    }).compileComponents()
    TestBed.inject(TranslateService).setTranslation('en', {
      XP: {
        Knowledgebase: {
          Wiki: {
            RequestNotSent: 'No generation request was sent. Retry after fixing the model settings.',
            Indeterminate: 'The provider outcome is uncertain and a retry may add a charge.',
            Reconciling: 'Checking the model provider outcome...'
          }
        },
        ACTIONS: { Retry: 'Retry' }
      }
    })
    TestBed.inject(TranslateService).use('en')
    fixture = TestBed.createComponent(KnowledgeWikiComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    return fixture.nativeElement as HTMLElement
  }

  afterEach(() => {
    fixture?.destroy()
    jest.restoreAllMocks()
    service.retryJob.mockClear()
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

  it('still requires confirmation for an uncertain provider outcome', async () => {
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false)
    const root = await render('indeterminate')
    expect(root.textContent).toContain('a retry may add a charge')
    Array.from(root.querySelectorAll('button'))
      .find((button) => button.textContent.trim() === 'Retry')
      .click()
    await fixture.whenStable()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(service.retryJob).not.toHaveBeenCalled()
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
        { provide: KnowledgebaseComponent, useValue: { paramId: signal('kb') } },
        { provide: ToastrService, useValue: { danger: jest.fn() } },
        { provide: ActivatedRoute, useValue: route },
        { provide: Router, useValue: router }
      ]
    })
      .overrideComponent(KnowledgeWikiComponent, { set: { template: '' } })
      .compileComponents()
    const fixture = TestBed.createComponent(KnowledgeWikiComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    return { fixture, router, route, service }
  }

  afterEach(() => TestBed.resetTestingModule())

  it.each([1, 50])(
    'keeps the URL, reload, and evidence return aligned for a page outside a %i-item list',
    async (size) => {
      const { fixture, router, route, service } = await setup(size)
      fixture.componentInstance.openLinkedPage('B')
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
      reloaded.detectChanges()
      await reloaded.componentInstance.refresh()
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
})
