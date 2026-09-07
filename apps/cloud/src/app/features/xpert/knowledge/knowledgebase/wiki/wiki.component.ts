import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { ActivatedRoute, Router } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  KnowledgeWikiPageDetail,
  KnowledgeWikiPageListItem,
  KnowledgeWikiPageType,
  KnowledgeWikiRecoveryAction,
  KnowledgeWikiStatusResponse
} from '@xpert-ai/contracts'
import {
  XpSpinComponent,
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardIconComponent,
  ZardInputDirective
} from '@xpert-ai/headless-ui'
import { MarkdownModule } from 'ngx-markdown'
import { firstValueFrom, timer } from 'rxjs'
import { getErrorMessage, KnowledgeWikiService, ToastrService } from '../../../../../@core'
import { KnowledgebaseComponent } from '../knowledgebase.component'

type WikiPageTypeFilter = 'all' | KnowledgeWikiPageType

const PAGE_SIZE = 50

@Component({
  standalone: true,
  selector: 'xp-knowledge-wiki',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    MarkdownModule,
    XpSpinComponent,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardIconComponent,
    ZardInputDirective
  ],
  templateUrl: './wiki.component.html',
  host: { class: 'flex min-w-0 w-full max-w-full flex-1' },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class KnowledgeWikiComponent {
  readonly #service = inject(KnowledgeWikiService)
  readonly #knowledgebaseComponent = inject(KnowledgebaseComponent)
  readonly #route = inject(ActivatedRoute)
  readonly #router = inject(Router)
  readonly #toastr = inject(ToastrService)
  readonly #translate = inject(TranslateService)

  #statusRequest = 0
  #listRequest = 0
  #pageRequest = 0
  readonly knowledgebaseId = this.#knowledgebaseComponent.paramId
  readonly status = signal<KnowledgeWikiStatusResponse | null>(null)
  readonly pages = signal<KnowledgeWikiPageListItem[]>([])
  readonly total = signal(0)
  readonly selectedPage = signal<KnowledgeWikiPageDetail | null>(null)
  readonly selectedPageId = signal<string | null>(null)
  readonly statusLoading = signal(false)
  readonly listLoading = signal(false)
  readonly pageLoading = signal(false)
  readonly rebuilding = signal(false)
  readonly loadError = signal<string | null>(null)
  readonly pageError = signal<string | null>(null)
  readonly search = new FormControl('', { nonNullable: true })
  readonly pageType = signal<WikiPageTypeFilter>('all')
  readonly pageTypes: readonly WikiPageTypeFilter[] = ['all', 'summary', 'entity', 'concept', 'index']
  readonly canManage = computed(() => this.status()?.canManage === true)
  readonly enabled = computed(() => this.status()?.enabled === true)
  readonly indexing = computed(() => this.status()?.status === 'indexing')
  readonly recoveryActions = computed<KnowledgeWikiRecoveryAction[]>(() => {
    const status = this.status()
    return status?.canManage === true ? status.recoveryActions : []
  })

  constructor() {
    this.#route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const requestedPageId = params.get('wikiPageId')
      if (requestedPageId && requestedPageId !== this.selectedPageId()) {
        this.selectedPageId.set(requestedPageId)
        if (this.enabled()) void this.loadPage(requestedPageId)
      }
    })
    effect(() => {
      const knowledgebaseId = this.knowledgebaseId()
      if (knowledgebaseId) void this.refresh()
    })
    effect((onCleanup) => {
      if (!this.indexing()) return
      const subscription = timer(3000, 3000).subscribe(() => void this.refresh(false))
      onCleanup(() => subscription.unsubscribe())
    })
  }

  async refresh(showLoading = true) {
    const knowledgebaseId = this.knowledgebaseId()
    if (!knowledgebaseId) return
    const request = ++this.#statusRequest
    if (showLoading) this.statusLoading.set(true)
    this.loadError.set(null)
    try {
      const status = await firstValueFrom(this.#service.getStatus(knowledgebaseId))
      if (request !== this.#statusRequest) return
      this.status.set(status)
      if (status.enabled) await this.loadPages()
      else {
        this.pages.set([])
        this.total.set(0)
        this.selectedPage.set(null)
      }
    } catch (error) {
      if (request === this.#statusRequest) this.loadError.set(getErrorMessage(error))
    } finally {
      if (request === this.#statusRequest) this.statusLoading.set(false)
    }
  }

  async loadPages() {
    const knowledgebaseId = this.knowledgebaseId()
    if (!knowledgebaseId || !this.enabled()) return
    const request = ++this.#listRequest
    this.listLoading.set(true)
    this.loadError.set(null)
    try {
      const pageType = this.pageType()
      const result = await firstValueFrom(
        this.#service.getPages(knowledgebaseId, {
          search: this.search.value.trim() || undefined,
          pageType: pageType === 'all' ? undefined : pageType,
          take: PAGE_SIZE
        })
      )
      if (request !== this.#listRequest) return
      this.pages.set(result.items)
      this.total.set(result.total)
      const requestedPageId = this.#route.snapshot.queryParamMap.get('wikiPageId')
      const nextId = requestedPageId ?? this.selectedPageId() ?? result.items[0]?.id ?? null
      if (nextId && (nextId !== this.selectedPageId() || !this.selectedPage())) {
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

  async selectPage(page: KnowledgeWikiPageListItem) {
    this.selectedPageId.set(page.id)
    await this.#router.navigate([], {
      relativeTo: this.#route,
      queryParams: { wikiPageId: page.id, section: null },
      queryParamsHandling: 'merge',
      replaceUrl: true
    })
    await this.loadPage(page.id)
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
    this.selectedPageId.set(null)
    void this.loadPages()
  }

  setPageType(pageType: WikiPageTypeFilter) {
    if (this.pageType() === pageType) return
    this.pageType.set(pageType)
    this.selectedPageId.set(null)
    void this.loadPages()
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
    const page = this.pages().find((item) => item.id === pageId)
    if (page) void this.selectPage(page)
    else {
      this.selectedPageId.set(pageId)
      void this.loadPage(pageId)
    }
  }

  openEvidence(documentId: string, chunkId: string) {
    void this.#router.navigate(['/xpert/knowledges', this.knowledgebaseId(), 'documents', documentId], {
      queryParams: { chunkId, returnTo: this.#router.url }
    })
  }
}
