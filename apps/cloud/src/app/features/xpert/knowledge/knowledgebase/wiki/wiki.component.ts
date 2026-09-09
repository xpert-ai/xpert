import { Dialog } from '@angular/cdk/dialog'
import type { KnowledgeWikiFolder, KnowledgeWikiTaxonomy } from '@xpert-ai/contracts'
import { WikiFolderDialogComponent, WikiFolderDialogResult } from './wiki-folder-dialog.component'
import { WikiGraphComponent } from './wiki-graph.component'
import { WikiPageTreeComponent } from './wiki-page-tree.component'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { ActivatedRoute, Router } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  KnowledgeWikiPageDetail,
  KnowledgeWikiClassificationItem,
  KnowledgeWikiPageListItem,
  KnowledgeWikiPageGroup,
  KnowledgeWikiRecoveryAction,
  KnowledgeWikiStatusResponse
} from '@xpert-ai/contracts'
import {
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardIconComponent,
  ZardInputDirective,
  ZardResizableImports
} from '@xpert-ai/headless-ui'
import { MarkdownModule } from 'ngx-markdown'
import { firstValueFrom, timer } from 'rxjs'
import { getErrorMessage, KnowledgeWikiService, ToastrService } from '../../../../../@core'
import { KnowledgebaseComponent } from '../knowledgebase.component'

const PAGE_SIZE = 50

@Component({
  standalone: true,
  selector: 'xp-knowledge-wiki',
  imports: [
    WikiPageTreeComponent,
    WikiGraphComponent,
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    MarkdownModule,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardIconComponent,
    ZardInputDirective,
    ...ZardResizableImports
  ],
  templateUrl: './wiki.component.html',
  host: { class: 'flex min-h-0 min-w-0 w-full max-w-full flex-1' },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class KnowledgeWikiComponent {
  readonly #service = inject(KnowledgeWikiService)
  readonly #knowledgebaseComponent = inject(KnowledgebaseComponent)
  readonly #route = inject(ActivatedRoute)
  readonly #router = inject(Router)
  readonly #toastr = inject(ToastrService)
  readonly #translate = inject(TranslateService)

  readonly #dialog = inject(Dialog)
  readonly #destroyRef = inject(DestroyRef)
  readonly classifying = signal(false)
  #classificationRequest = 0
  #classificationTimer?: ReturnType<typeof setTimeout>
  readonly view = signal<'read' | 'graph'>('read')
  readonly graphVisited = signal(false)
  readonly directoryTree = viewChild<WikiPageTreeComponent>('directoryTree')
  readonly taxonomy = signal<KnowledgeWikiTaxonomy | null>(null)
  readonly folderId = signal<string | null>(null)
  readonly organizationError = signal('')
  readonly organizing = signal(false)
  readonly pageFolderPath = computed(() => {
    const folders = this.taxonomy()?.folders ?? []
    const names: string[] = [],
      visited = new Set<string>()
    let id = this.selectedPage()?.placement?.folderId
    while (id && !visited.has(id)) {
      visited.add(id)
      const folder = folders.find((folder) => folder.id === id)
      if (!folder) break
      names.unshift(folder.name)
      id = folder.parentId
    }
    return names.join(' / ')
  })
  #taxonomyRequest = 0
  #statusRequest = 0
  #listRequest = 0
  #pageRequest = 0
  #contentKnowledgebaseId: string | null = null
  readonly knowledgebaseId = this.#knowledgebaseComponent.paramId
  readonly status = signal<KnowledgeWikiStatusResponse | null>(null)
  readonly pages = signal<KnowledgeWikiPageListItem[]>([])
  readonly total = signal(0)
  readonly selectedPage = signal<KnowledgeWikiPageDetail | null>(null)
  readonly selectedPageId = signal<string | null>(null)
  readonly statusLoading = signal(false)
  readonly statusError = signal<string | null>(null)
  readonly listLoading = signal(false)
  readonly pageLoading = signal(false)
  readonly rebuilding = signal(false)
  readonly loadError = signal<string | null>(null)
  readonly pageError = signal<string | null>(null)
  readonly search = new FormControl('', { nonNullable: true })
  readonly appliedSearch = signal('')
  readonly pageGroup = signal<KnowledgeWikiPageGroup>('knowledge')
  readonly pageGroups: readonly KnowledgeWikiPageGroup[] = ['knowledge', 'summary']
  readonly canManage = computed(() => this.status()?.canManage === true)
  readonly enabled = computed(() => {
    const status = this.status()
    if (status) return status.enabled
    const knowledgebase = this.#knowledgebaseComponent.knowledgebase()
    return knowledgebase?.id === this.knowledgebaseId() ? knowledgebase.wikiConfig?.enabled === true : undefined
  })
  readonly indexing = computed(() => this.status()?.status === 'indexing')
  readonly recoveryActions = computed<KnowledgeWikiRecoveryAction[]>(() => {
    const status = this.status()
    return status?.canManage === true ? status.recoveryActions : []
  })

  constructor() {
    this.#destroyRef.onDestroy(() => {
      this.resetClassification()
      this.#statusRequest++
      this.#listRequest++
      this.#pageRequest++
      this.#taxonomyRequest++
    })
    this.#route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const folder = params.get('wikiFolderId')
      const view = params.get('wikiView')
      this.view.set(view === 'graph' ? 'graph' : 'read')
      if (view === 'classification') void this.setView('read')
      if (view === 'graph') this.graphVisited.set(true)
      this.folderId.set(folder)
      const requestedPageId = params.get('wikiPageId')
      if (requestedPageId && requestedPageId !== this.selectedPageId()) {
        this.selectedPageId.set(requestedPageId)
        if (this.enabled() && this.#contentKnowledgebaseId === this.knowledgebaseId())
          void this.loadPage(requestedPageId)
      }
    })
    effect(() => {
      const knowledgebaseId = this.knowledgebaseId()
      if (knowledgebaseId)
        untracked(() => {
          this.resetClassification()
          this.status.set(null)
          this.statusError.set(null)
          this.resetContent()
          void this.loadStatus()
        })
    })
    effect(() => {
      const id = this.knowledgebaseId(),
        enabled = this.enabled()
      untracked(() => {
        if (id && enabled && this.#contentKnowledgebaseId !== id) {
          this.#contentKnowledgebaseId = id
          void this.refreshContent()
        } else if (enabled === false) {
          this.resetContent()
        }
      })
    })
    effect((onCleanup) => {
      if (!this.indexing()) return
      const subscription = timer(3000, 3000).subscribe(() => {
        if (!this.statusLoading()) void this.refresh()
      })
      onCleanup(() => subscription.unsubscribe())
    })
  }

  private resetContent() {
    this.#contentKnowledgebaseId = null
    this.#listRequest++
    this.#pageRequest++
    this.#taxonomyRequest++
    this.pages.set([])
    this.total.set(0)
    this.selectedPage.set(null)
    this.selectedPageId.set(this.#route.snapshot.queryParamMap.get('wikiPageId'))
    this.taxonomy.set(null)
    this.listLoading.set(false)
    this.pageLoading.set(false)
    this.loadError.set(null)
    this.pageError.set(null)
    this.organizationError.set('')
  }

  private async refreshContent() {
    await Promise.all([this.loadPages(), this.loadTaxonomy()])
  }

  async refresh() {
    await Promise.all([this.loadStatus(), ...(this.enabled() ? [this.refreshContent()] : [])])
  }

  async loadStatus() {
    const knowledgebaseId = this.knowledgebaseId()
    if (!knowledgebaseId) return
    const request = ++this.#statusRequest
    this.statusLoading.set(true)
    this.statusError.set(null)
    try {
      const status = await firstValueFrom(this.#service.getStatus(knowledgebaseId))
      if (request !== this.#statusRequest || knowledgebaseId !== this.knowledgebaseId()) return
      this.status.set(status)
      if (status.enabled && status.canManage && !this.classifying()) void this.restoreClassification()
    } catch (error) {
      if (request === this.#statusRequest) this.statusError.set(getErrorMessage(error))
    } finally {
      if (request === this.#statusRequest) this.statusLoading.set(false)
    }
  }

  async loadPages(append = false) {
    const knowledgebaseId = this.knowledgebaseId()
    if (!knowledgebaseId || !this.enabled()) return
    const request = ++this.#listRequest
    this.listLoading.set(true)
    this.loadError.set(null)
    try {
      const result = await firstValueFrom(
        this.#service.getPages(knowledgebaseId, {
          search: this.appliedSearch() || undefined,
          pageGroup: this.pageGroup(),
          take: PAGE_SIZE,
          skip: append ? this.pages().length : 0
        })
      )
      if (request !== this.#listRequest) return
      this.pages.set(append ? [...this.pages(), ...result.items] : result.items)
      this.total.set(result.total)
      const requestedPageId = this.#route.snapshot.queryParamMap.get('wikiPageId')
      const nextId = requestedPageId ?? this.selectedPageId() ?? result.items[0]?.id ?? null
      if (nextId && (!append || nextId !== this.selectedPageId() || !this.selectedPage())) {
        this.selectedPageId.set(nextId)
        await this.loadPage(nextId)
      } else if (!nextId) {
        this.selectedPage.set(null)
      }
    } catch (error) {
      if (request === this.#listRequest) this.loadError.set(getErrorMessage(error))
    } finally {
      if (request === this.#listRequest) this.listLoading.set(false)
    }
  }

  async loadTaxonomy() {
    const request = ++this.#taxonomyRequest
    try {
      const result = await firstValueFrom(
        this.#service.getTaxonomy(this.knowledgebaseId(), {
          search: this.appliedSearch() || undefined,
          pageGroup: this.pageGroup()
        })
      )
      if (request === this.#taxonomyRequest) {
        this.taxonomy.set(result)
        this.organizationError.set('')
      }
    } catch (error) {
      if (request === this.#taxonomyRequest) this.organizationError.set(getErrorMessage(error))
    }
  }
  async setView(view: 'read' | 'graph') {
    this.view.set(view)
    if (view === 'graph') this.graphVisited.set(true)
    await this.#router.navigate([], {
      relativeTo: this.#route,
      queryParams: { wikiView: view },
      queryParamsHandling: 'merge',
      replaceUrl: true
    })
  }
  async setFolder(folderId: string | null) {
    await this.#router.navigate([], {
      relativeTo: this.#route,
      queryParams: { wikiFolderId: folderId, wikiView: 'read' },
      queryParamsHandling: 'merge',
      replaceUrl: true
    })
  }
  async editFolder(folder?: KnowledgeWikiFolder) {
    const result = await firstValueFrom(
      this.#dialog.open<WikiFolderDialogResult>(WikiFolderDialogComponent, {
        data: { folders: this.taxonomy()?.folders ?? [], folder },
        backdropClass: 'backdrop-blur-xs-black',
        panelClass: 'xp-overlay-pane-dialog'
      }).closed
    )
    if (!result) return
    await this.organize(async () => {
      if (result.action === 'delete' && folder) {
        await firstValueFrom(this.#service.deleteFolder(this.knowledgebaseId(), folder))
        if (this.folderId() === folder.id) await this.setFolder(null)
      } else if (result.action === 'save')
        await firstValueFrom(this.#service.saveFolder(this.knowledgebaseId(), result.input, folder))
    })
  }
  async movePage() {
    const page = this.selectedPage()
    if (!page) return
    const result = await firstValueFrom(
      this.#dialog.open<WikiFolderDialogResult>(WikiFolderDialogComponent, {
        data: { folders: this.taxonomy()?.folders ?? [], move: true, folderId: page.placement?.folderId },
        backdropClass: 'backdrop-blur-xs-black',
        panelClass: 'xp-overlay-pane-dialog'
      }).closed
    )
    if (result?.action !== 'save') return
    await this.organize(async () => {
      await firstValueFrom(
        this.#service.movePage(this.knowledgebaseId(), page.id, result.input.parentId, page.placement?.version ?? 0)
      )
      await this.loadPage(page.id)
    })
  }
  async organize(action: () => Promise<unknown>) {
    if (this.organizing()) return
    this.organizing.set(true)
    try {
      await action()
      await Promise.all([this.loadTaxonomy(), this.loadPages()])
    } catch (error) {
      this.#toastr.danger(error)
      this.organizationError.set(getErrorMessage(error))
    } finally {
      this.organizing.set(false)
    }
  }
  async classificationChanged() {
    await Promise.all([this.loadTaxonomy(), this.loadPages()])
  }
  private resetClassification() {
    this.#classificationRequest++
    clearTimeout(this.#classificationTimer)
    this.classifying.set(false)
  }

  private classificationCurrent(id: string, request: number) {
    return !this.#destroyRef.destroyed && id === this.knowledgebaseId() && request === this.#classificationRequest
  }

  private async restoreClassification() {
    const id = this.knowledgebaseId(),
      request = ++this.#classificationRequest
    this.classifying.set(true)
    try {
      const status = await firstValueFrom(this.#service.getClassificationStatus(id))
      if (!this.classificationCurrent(id, request)) return
      if (status.activeJobs > 0) {
        const items = await firstValueFrom(this.#service.getClassifications(id))
        if (!this.classificationCurrent(id, request)) return
        const activeJobs = new Set(
          items.filter((item) => item.status === 'queued' || item.status === 'running').map((item) => item.jobId)
        )
        await this.pollClassification(id, request, undefined, false, activeJobs)
      } else this.classifying.set(false)
    } catch (error) {
      this.classificationFailed(id, request, error)
    }
  }

  async classifyPages() {
    const id = this.knowledgebaseId()
    if (!id || !this.canManage() || this.classifying()) return
    const request = ++this.#classificationRequest
    this.classifying.set(true)
    try {
      const [status, items] = await Promise.all([
        firstValueFrom(this.#service.getClassificationStatus(id)),
        firstValueFrom(this.#service.getClassifications(id))
      ])
      if (!this.classificationCurrent(id, request)) return
      const activeJobs = new Set(
        items.filter((item) => item.status === 'queued' || item.status === 'running').map((item) => item.jobId)
      )
      if (status.activeJobs > 0 || activeJobs.size) {
        await this.pollClassification(id, request, undefined, false, activeJobs)
        return
      }
      const failedJobs = new Set(items.filter((item) => item.status === 'failed').map((item) => item.jobId))
      if (failedJobs.size) {
        for (const jobId of failedJobs) {
          if (!this.classificationCurrent(id, request)) return
          // Retrying from this button never authorizes a duplicate provider charge.
          await firstValueFrom(this.#service.retryJob(id, jobId, false))
        }
        await this.pollClassification(id, request, undefined, false, failedJobs)
        return
      }
      const run = await firstValueFrom(this.#service.classify(id))
      if (!this.classificationCurrent(id, request)) return
      if (run.count === 0) {
        await this.classificationChanged()
        if (this.classificationCurrent(id, request)) {
          this.classifying.set(false)
          this.#toastr.success('XP.Knowledgebase.Wiki.Organization.NoEligiblePages')
        }
        return
      }
      await this.pollClassification(id, request, run.runId, run.truncated)
    } catch (error) {
      this.classificationFailed(id, request, error)
    }
  }

  private async pollClassification(
    id: string,
    request: number,
    runId?: string,
    truncated = false,
    jobIds?: ReadonlySet<string>
  ) {
    if (!this.classificationCurrent(id, request)) return
    try {
      const [status, results] = await Promise.all([
        firstValueFrom(this.#service.getClassificationStatus(id)),
        firstValueFrom(this.#service.getClassifications(id, runId))
      ])
      if (!this.classificationCurrent(id, request)) return
      const items = jobIds ? results.filter((item) => jobIds.has(item.jobId)) : results
      if (status.activeJobs > 0 || items.some((item) => item.status === 'queued' || item.status === 'running')) {
        this.#classificationTimer = setTimeout(
          () => void this.pollClassification(id, request, runId, truncated, jobIds),
          3000
        )
        return
      }
      await this.classificationChanged()
      if (!this.classificationCurrent(id, request)) return
      this.classifying.set(false)
      this.notifyClassification(items, truncated)
    } catch (error) {
      this.classificationFailed(id, request, error)
    }
  }

  private classificationFailed(id: string, request: number, error: unknown) {
    if (!this.classificationCurrent(id, request)) return
    this.classifying.set(false)
    this.#toastr.danger(error)
  }

  private notifyClassification(items: KnowledgeWikiClassificationItem[], truncated: boolean) {
    const failed = items.find((item) => item.status === 'failed')
    if (failed) {
      this.#toastr.danger(failed.error || this.#translate.instant('XP.Knowledgebase.Wiki.Organization.State.failed'))
    } else if (truncated) {
      this.#toastr.warning('XP.Knowledgebase.Wiki.Organization.ClassificationBatchDone')
    } else {
      this.#toastr.success('XP.Knowledgebase.Wiki.Organization.ClassificationDone', {
        count: items.filter((item) => item.status === 'succeeded' && item.outcome === 'applied').length
      })
    }
  }
  async openGraphPage(id: string) {
    await this.setView('read')
    await this.openPage(id)
  }

  selectPage(page: KnowledgeWikiPageListItem) {
    return this.openGraphPage(page.id)
  }

  private async openPage(pageId: string) {
    this.selectedPageId.set(pageId)
    await this.#router.navigate([], {
      relativeTo: this.#route,
      queryParams: { wikiPageId: pageId, section: null },
      queryParamsHandling: 'merge',
      replaceUrl: true
    })
    await this.loadPage(pageId)
  }

  async loadPage(pageId: string) {
    const knowledgebaseId = this.knowledgebaseId()
    if (!knowledgebaseId) return
    const request = ++this.#pageRequest
    this.pageLoading.set(true)
    this.pageError.set(null)
    try {
      const page = await firstValueFrom(this.#service.getPage(knowledgebaseId, pageId))
      if (request !== this.#pageRequest || pageId !== this.selectedPageId()) return
      this.selectedPage.set(page)
      const section = this.#route.snapshot.queryParamMap.get('section')
      if (section) queueMicrotask(() => document.getElementById(section)?.scrollIntoView({ block: 'start' }))
    } catch (error) {
      if (request === this.#pageRequest) {
        this.selectedPage.set(null)
        this.pageError.set(getErrorMessage(error))
      }
    } finally {
      if (request === this.#pageRequest) this.pageLoading.set(false)
    }
  }

  applySearch() {
    this.appliedSearch.set(this.search.value.trim())
    this.taxonomy.set(null)
    this.pages.set([])
    void this.refreshContent()
  }

  setPageGroup(pageGroup: KnowledgeWikiPageGroup) {
    if (this.pageGroup() === pageGroup) return
    this.pageGroup.set(pageGroup)
    this.taxonomy.set(null)
    this.pages.set([])
    void this.refreshContent()
  }

  openConfiguration() {
    this.#knowledgebaseComponent.openConfiguration()
  }

  async rebuild() {
    const knowledgebaseId = this.knowledgebaseId()
    if (!knowledgebaseId || this.rebuilding()) return
    const confirmed = window.confirm(
      this.#translate.instant('XP.Knowledgebase.Wiki.RebuildConfirm', {
        Default: 'Rebuilding Wiki content calls the configured model and may incur charges. Continue?'
      })
    )
    if (!confirmed) return
    this.rebuilding.set(true)
    try {
      await firstValueFrom(
        this.#service.rebuild(knowledgebaseId, {
          confirmModelCharges: true,
          maxModelInvocations: Math.max(20, (this.#knowledgebaseComponent.documentNum() || 1) * 20),
          maxEstimatedTokens: Math.max(200_000, (this.#knowledgebaseComponent.documentNum() || 1) * 200_000)
        })
      )
      await this.refresh()
    } catch (error) {
      this.#toastr.danger(error)
    } finally {
      this.rebuilding.set(false)
    }
  }

  async retry(action: KnowledgeWikiRecoveryAction) {
    const knowledgebaseId = this.knowledgebaseId()
    if (!knowledgebaseId || !action.canRetry) return
    if (action.recommendedAction === 'full_rebuild') {
      await this.rebuild()
      return
    }
    let confirmed = true
    if (action.requiresAdditionalChargeConfirmation) {
      confirmed = window.confirm(
        this.#translate.instant('XP.Knowledgebase.Wiki.RetryChargeConfirm', {
          Default: 'The provider may already have charged the previous call. Retry and allow an additional charge?'
        })
      )
    }
    if (!confirmed) return
    try {
      await firstValueFrom(
        this.#service.retryJob(knowledgebaseId, action.jobId, action.requiresAdditionalChargeConfirmation)
      )
      await this.refresh()
    } catch (error) {
      this.#toastr.danger(error)
    }
  }

  openLinkedPage(pageId: string) {
    void this.openPage(pageId)
  }

  openEvidence(documentId: string, chunkId: string) {
    void this.#router.navigate(['/xpert/knowledges', this.knowledgebaseId(), 'documents', documentId], {
      queryParams: { chunkId, returnTo: this.#router.url }
    })
  }
}
