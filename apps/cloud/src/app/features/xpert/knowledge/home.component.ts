import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, OnDestroy, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { Router, RouterModule } from '@angular/router'
import { injectConfirmDelete, ZardTooltipImports } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { catchError, firstValueFrom, forkJoin, map, of, switchMap, take } from 'rxjs'
import {
  getErrorMessage,
  IKnowledgebase,
  KDocumentSourceType,
  KnowledgebasePermission,
  KnowledgebaseService,
  KnowledgebaseStatusEnum,
  KnowledgeDocumentService,
  OrderTypeEnum,
  Store,
  ToastrService,
  XpertWorkspaceService
} from '../../../@core'
import { ClawXpertBindingTargetService } from '../../chat/clawxpert/clawxpert-binding-target.service'
import { XpertNewKnowledgeComponent } from './new/new.component'

type KnowledgeScope = 'all' | 'favorites' | 'recents' | 'personal' | 'team'
type KnowledgeSection = 'pinned' | 'regular'

type KnowledgeSectionVisibility = Record<KnowledgeSection, boolean>

type RecentKnowledgebase = {
  id: string
  visitedAt: number
}

type KnowledgebaseCardItem = IKnowledgebase & {
  folderNum?: number | null
}

const SCOPE_RAIL_MIN_WIDTH = 56
const SCOPE_RAIL_DEFAULT_WIDTH = 56
const SCOPE_RAIL_MAX_WIDTH = 228
const SCOPE_RAIL_EXPANDED_WIDTH = 120

type KnowledgeScopeOption = {
  key: KnowledgeScope
  label: string
  icon: string
}

@Component({
  standalone: true,
  selector: 'xpert-workspace-knowledgebases',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  imports: [CommonModule, RouterModule, TranslateModule, CdkMenuModule, ...ZardTooltipImports],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class KnowledgebaseHomeComponent implements OnDestroy {
  readonly KnowledgebasePermission = KnowledgebasePermission
  readonly KnowledgebaseStatusEnum = KnowledgebaseStatusEnum

  readonly #dialog = inject(Dialog)
  readonly #router = inject(Router)
  readonly #store = inject(Store)
  readonly #knowledgebaseService = inject(KnowledgebaseService)
  readonly #knowledgeDocumentService = inject(KnowledgeDocumentService)
  readonly #toastr = inject(ToastrService)
  readonly #clawXpertBindingTargetService = inject(ClawXpertBindingTargetService)
  readonly #workspaceService = inject(XpertWorkspaceService)
  readonly confirmDelete = injectConfirmDelete()

  readonly scopeOptions: KnowledgeScopeOption[] = [
    { key: 'all', label: '全部', icon: 'ri-stack-line' },
    { key: 'favorites', label: '收藏', icon: 'ri-star-line' },
    { key: 'recents', label: '最近', icon: 'ri-history-line' },
    { key: 'personal', label: '个人', icon: 'ri-user-line' },
    { key: 'team', label: '团队', icon: 'ri-team-line' }
  ]

  readonly #clawXpertContext = toSignal(
    this.#store.selectOrganizationId().pipe(
      switchMap(() =>
        this.#clawXpertBindingTargetService.getCurrentUserTarget().pipe(
          switchMap((target) =>
            target
              ? this.#workspaceService.getAllMy(undefined, { purpose: 'authoring' }).pipe(
                  map(({ items }) => ({
                    target,
                    workspace: items.find((workspace) => workspace.id === target.workspaceId) ?? null
                  }))
                )
              : of({ target: null, workspace: null })
          ),
          catchError(() => of({ target: null, workspace: null }))
        )
      )
    ),
    { initialValue: undefined }
  )

  readonly workspaceId = computed(() => this.#clawXpertContext()?.target?.workspaceId ?? null)
  readonly canWriteWorkspace = computed(() => {
    const workspace = this.#clawXpertContext()?.workspace
    return !!workspace && this.#workspaceService.canWrite(workspace)
  })

  readonly knowledgebases = signal<KnowledgebaseCardItem[]>([])
  readonly loading = signal(false)
  readonly loadError = signal<string | null>(null)
  readonly activeScope = signal<KnowledgeScope>('all')
  readonly favoriteIds = signal<string[]>([])
  readonly pinnedIds = signal<string[]>([])
  readonly recentKnowledgebases = signal<RecentKnowledgebase[]>([])
  readonly sectionVisibility = signal<KnowledgeSectionVisibility>({ pinned: true, regular: true })
  readonly scopeRailWidth = signal(SCOPE_RAIL_DEFAULT_WIDTH)
  readonly scopeRailResizing = signal(false)
  readonly scopeRailMinWidth = SCOPE_RAIL_MIN_WIDTH
  readonly scopeRailMaxWidth = SCOPE_RAIL_MAX_WIDTH
  readonly scopeRailExpandedWidth = SCOPE_RAIL_EXPANDED_WIDTH

  readonly personalKnowledgebases = computed(() =>
    this.knowledgebases().filter((item) => !item.permission || item.permission === KnowledgebasePermission.Private)
  )
  readonly teamKnowledgebases = computed(() =>
    this.knowledgebases().filter(
      (item) =>
        item.permission === KnowledgebasePermission.Organization || item.permission === KnowledgebasePermission.Public
    )
  )
  readonly favoriteKnowledgebases = computed(() => {
    const items = new Map(this.knowledgebases().map((item) => [String(item.id), item]))
    return this.favoriteIds()
      .map((id) => items.get(id))
      .filter((item): item is IKnowledgebase => !!item)
  })
  readonly recentKnowledgebaseItems = computed(() => {
    const items = new Map(this.knowledgebases().map((item) => [String(item.id), item]))
    return this.recentKnowledgebases()
      .map(({ id }) => items.get(id))
      .filter((item): item is IKnowledgebase => !!item)
  })
  readonly visibleKnowledgebases = computed(() => {
    switch (this.activeScope()) {
      case 'favorites':
        return this.favoriteKnowledgebases()
      case 'recents':
        return this.recentKnowledgebaseItems()
      case 'personal':
        return this.personalKnowledgebases()
      case 'team':
        return this.teamKnowledgebases()
      default:
        return this.knowledgebases()
    }
  })
  readonly pinnedKnowledgebases = computed(() => {
    const pinned = new Set(this.pinnedIds())
    return this.visibleKnowledgebases().filter((item) => pinned.has(String(item.id)))
  })
  readonly unpinnedKnowledgebases = computed(() => {
    const pinned = new Set(this.pinnedIds())
    return this.visibleKnowledgebases().filter((item) => !pinned.has(String(item.id)))
  })

  readonly regularSectionTitle = computed(() => {
    const labels: Record<KnowledgeScope, string> = {
      all: '我创建的',
      favorites: '我的收藏',
      recents: '最近访问',
      personal: '个人知识库',
      team: '团队知识库'
    }
    return labels[this.activeScope()]
  })

  readonly emptyTitle = computed(() => {
    const labels: Record<KnowledgeScope, string> = {
      all: '还没有知识库',
      favorites: '还没有收藏知识库',
      recents: '还没有最近访问',
      personal: '还没有个人知识库',
      team: '还没有团队知识库'
    }
    return labels[this.activeScope()]
  })

  readonly emptyDescription = computed(() => {
    const labels: Record<KnowledgeScope, string> = {
      all: '创建一个知识库，开始组织和检索团队知识。',
      favorites: '在知识库卡片上点击星标，常用内容会集中显示在这里。',
      recents: '打开过的知识库会按访问时间显示在这里。',
      personal: '创建私有知识库，仅供自己使用。',
      team: '创建组织或公开知识库，与团队成员共享。'
    }
    return labels[this.activeScope()]
  })

  #requestVersion = 0
  #preferencesWorkspaceId: string | null = null
  #scopeRailResizeCleanup: (() => void) | null = null

  constructor() {
    effect(() => {
      const context = this.#clawXpertContext()
      if (context === undefined) {
        return
      }

      const workspaceId = this.workspaceId()
      this.loadPreferences(workspaceId)
      void this.loadKnowledgebases()
    })
  }

  ngOnDestroy() {
    this.#scopeRailResizeCleanup?.()
  }

  selectScope(scope: KnowledgeScope) {
    this.activeScope.set(scope)
  }

  sectionExpanded(section: KnowledgeSection) {
    return this.sectionVisibility()[section]
  }

  toggleSection(section: KnowledgeSection) {
    this.sectionVisibility.update((visibility) => ({
      ...visibility,
      [section]: !visibility[section]
    }))
    this.persistPreferences()
  }

  startScopeRailResize(event: PointerEvent) {
    if (event.button !== 0) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    this.#scopeRailResizeCleanup?.()

    const startX = event.clientX
    const startWidth = this.scopeRailWidth()
    const resizeHandle = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
    resizeHandle?.setPointerCapture(event.pointerId)
    this.scopeRailResizing.set(true)

    const onPointerMove = (moveEvent: PointerEvent) => {
      this.scopeRailWidth.set(this.normalizeScopeRailWidth(startWidth + moveEvent.clientX - startX))
    }
    let finishResize: () => void
    const cleanup = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', finishResize)
      window.removeEventListener('pointercancel', finishResize)
      if (resizeHandle?.hasPointerCapture(event.pointerId)) {
        resizeHandle.releasePointerCapture(event.pointerId)
      }
      this.scopeRailResizing.set(false)
      this.#scopeRailResizeCleanup = null
    }
    finishResize = () => {
      cleanup()
      this.persistPreferences()
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', finishResize, { once: true })
    window.addEventListener('pointercancel', finishResize, { once: true })
    this.#scopeRailResizeCleanup = cleanup
  }

  resizeScopeRailFromKeyboard(event: KeyboardEvent) {
    const resizeDelta = event.shiftKey ? 32 : 12
    let nextWidth: number | null = null
    if (event.key === 'ArrowLeft') {
      nextWidth = this.scopeRailWidth() - resizeDelta
    } else if (event.key === 'ArrowRight') {
      nextWidth = this.scopeRailWidth() + resizeDelta
    } else if (event.key === 'Home') {
      nextWidth = SCOPE_RAIL_MIN_WIDTH
    } else if (event.key === 'End') {
      nextWidth = SCOPE_RAIL_MAX_WIDTH
    }

    if (nextWidth === null) {
      return
    }

    event.preventDefault()
    this.scopeRailWidth.set(this.normalizeScopeRailWidth(nextWidth))
    this.persistPreferences()
  }

  scopeCount(scope: KnowledgeScope) {
    switch (scope) {
      case 'favorites':
        return this.favoriteKnowledgebases().length
      case 'recents':
        return this.recentKnowledgebaseItems().length
      case 'personal':
        return this.personalKnowledgebases().length
      case 'team':
        return this.teamKnowledgebases().length
      default:
        return this.knowledgebases().length
    }
  }

  async loadKnowledgebases() {
    const requestVersion = ++this.#requestVersion
    const workspaceId = this.workspaceId()
    if (!workspaceId) {
      this.knowledgebases.set([])
      this.loadError.set(null)
      return
    }

    this.loading.set(true)
    this.loadError.set(null)
    try {
      const result = await firstValueFrom(
        this.#knowledgebaseService.getAllByWorkspaceOnly(workspaceId, {
          relations: ['createdBy'],
          order: { updatedAt: OrderTypeEnum.DESC }
        })
      )
      if (requestVersion !== this.#requestVersion) {
        return
      }

      const items = await this.hydrateCardStatistics(result.items ?? [])
      if (requestVersion !== this.#requestVersion) {
        return
      }

      this.knowledgebases.set(items)
      this.removeUnavailablePreferences(items)
    } catch (error) {
      if (requestVersion === this.#requestVersion) {
        this.knowledgebases.set([])
        this.loadError.set(getErrorMessage(error))
      }
    } finally {
      if (requestVersion === this.#requestVersion) {
        this.loading.set(false)
      }
    }
  }

  openKnowledgebase(item: IKnowledgebase) {
    if (!item.id) {
      return
    }
    const id = String(item.id)
    this.touchRecent(id)
    void this.#router.navigate(['/xpert/knowledges', id])
  }

  openKnowledgebaseFromKeyboard(event: Event, item: IKnowledgebase) {
    if (event.target !== event.currentTarget) {
      return
    }

    event.preventDefault()
    this.openKnowledgebase(item)
  }

  newKnowledgebase() {
    const workspaceId = this.workspaceId()
    if (!workspaceId || !this.canWriteWorkspace()) {
      return
    }

    this.#dialog
      .open<IKnowledgebase>(XpertNewKnowledgeComponent, {
        width: 'min(96vw, 72rem)',
        height: 'min(90vh, 52rem)',
        maxWidth: 'calc(100vw - 1.5rem)',
        maxHeight: 'calc(100vh - 1.5rem)',
        panelClass: 'xp-overlay-pane-card',
        data: { workspaceId }
      })
      .closed.subscribe((knowledgebase) => {
        if (knowledgebase?.id) {
          this.openKnowledgebase(knowledgebase)
        }
      })
  }

  editKnowledgebase(item: IKnowledgebase) {
    if (!this.canManage(item)) {
      return
    }

    this.#dialog
      .open<IKnowledgebase>(XpertNewKnowledgeComponent, {
        width: 'min(96vw, 72rem)',
        height: 'min(90vh, 52rem)',
        maxWidth: 'calc(100vw - 1.5rem)',
        maxHeight: 'calc(100vh - 1.5rem)',
        panelClass: 'xp-overlay-pane-card',
        data: {
          workspaceId: this.workspaceId(),
          knowledgebase: item
        }
      })
      .closed.subscribe((updated) => {
        if (updated) {
          void this.loadKnowledgebases()
        }
      })
  }

  deleteKnowledgebase(item: IKnowledgebase) {
    if (!item.id || !this.canManage(item)) {
      return
    }

    this.confirmDelete(
      {
        value: item.name,
        information: '删除后，该知识库中的文档和索引数据也会一并删除。'
      },
      this.#knowledgebaseService.delete(String(item.id))
    ).subscribe({
      next: () => {
        const id = String(item.id)
        this.favoriteIds.update((ids) => ids.filter((value) => value !== id))
        this.pinnedIds.update((ids) => ids.filter((value) => value !== id))
        this.recentKnowledgebases.update((entries) => entries.filter((entry) => entry.id !== id))
        this.persistPreferences()
        this.#toastr.success('XP.Messages.DeletedSuccessfully', { Default: 'Deleted successfully' })
        void this.loadKnowledgebases()
      },
      error: (error) => this.#toastr.error(getErrorMessage(error))
    })
  }

  toggleFavorite(item: IKnowledgebase, event: Event) {
    event.stopPropagation()
    if (!item.id) {
      return
    }

    const id = String(item.id)
    this.favoriteIds.update((ids) => (ids.includes(id) ? ids.filter((value) => value !== id) : [id, ...ids]))
    this.persistPreferences()
  }

  isFavorite(item: IKnowledgebase) {
    return !!item.id && this.favoriteIds().includes(String(item.id))
  }

  togglePinned(item: IKnowledgebase) {
    if (!item.id) {
      return
    }

    const id = String(item.id)
    this.pinnedIds.update((ids) => (ids.includes(id) ? ids.filter((value) => value !== id) : [id, ...ids]))
    this.persistPreferences()
    this.#toastr.success(this.isPinned(item) ? '知识库已置顶' : '已取消置顶')
  }

  isPinned(item: IKnowledgebase) {
    return !!item.id && this.pinnedIds().includes(String(item.id))
  }

  canManage(item: IKnowledgebase) {
    return this.canWriteWorkspace() && !!item.workspaceId && item.workspaceId === this.workspaceId()
  }

  permissionLabel(item: IKnowledgebase) {
    if (item.permission === KnowledgebasePermission.Public) {
      return '公开'
    }
    if (item.permission === KnowledgebasePermission.Organization) {
      return '组织内'
    }
    return '私有'
  }

  permissionIcon(item: IKnowledgebase) {
    if (item.permission === KnowledgebasePermission.Public) {
      return 'ri-earth-line'
    }
    if (item.permission === KnowledgebasePermission.Organization) {
      return 'ri-team-line'
    }
    return 'ri-lock-line'
  }

  creatorLabel(item: IKnowledgebase) {
    const creator = item.createdBy
    return creator?.name || creator?.fullName || creator?.firstName || creator?.email || ''
  }

  private touchRecent(id: string) {
    this.recentKnowledgebases.update((entries) =>
      [{ id, visitedAt: Date.now() }, ...entries.filter((entry) => entry.id !== id)].slice(0, 30)
    )
    this.persistPreferences()
  }

  private loadPreferences(workspaceId: string | null) {
    if (this.#preferencesWorkspaceId === workspaceId) {
      return
    }
    this.#preferencesWorkspaceId = workspaceId
    if (!workspaceId) {
      this.favoriteIds.set([])
      this.pinnedIds.set([])
      this.recentKnowledgebases.set([])
      this.sectionVisibility.set({ pinned: true, regular: true })
      this.scopeRailWidth.set(SCOPE_RAIL_DEFAULT_WIDTH)
      return
    }

    this.favoriteIds.set(this.readStorage<string[]>(this.storageKey('favorites'), []))
    this.pinnedIds.set(this.readStorage<string[]>(this.storageKey('pinned'), []))
    this.sectionVisibility.set({
      pinned: true,
      regular: true,
      ...this.readStorage<Partial<KnowledgeSectionVisibility>>(this.storageKey('sections'), {})
    })
    this.recentKnowledgebases.set(
      this.readStorage<RecentKnowledgebase[]>(this.storageKey('recents'), [])
        .filter((entry) => !!entry?.id && Number.isFinite(entry.visitedAt))
        .sort((left, right) => right.visitedAt - left.visitedAt)
        .slice(0, 30)
    )
    this.scopeRailWidth.set(
      this.normalizeScopeRailWidth(
        this.readStorage<number>(this.storageKey('scope-rail-width-v2'), SCOPE_RAIL_DEFAULT_WIDTH)
      )
    )
  }

  private removeUnavailablePreferences(items: IKnowledgebase[]) {
    const availableIds = new Set(items.map((item) => String(item.id)))
    const favorites = this.favoriteIds().filter((id) => availableIds.has(id))
    const pinned = this.pinnedIds().filter((id) => availableIds.has(id))
    const recents = this.recentKnowledgebases().filter((entry) => availableIds.has(entry.id))
    if (
      favorites.length !== this.favoriteIds().length ||
      pinned.length !== this.pinnedIds().length ||
      recents.length !== this.recentKnowledgebases().length
    ) {
      this.favoriteIds.set(favorites)
      this.pinnedIds.set(pinned)
      this.recentKnowledgebases.set(recents)
      this.persistPreferences()
    }
  }

  private persistPreferences() {
    const workspaceId = this.#preferencesWorkspaceId
    if (!workspaceId) {
      return
    }
    this.writeStorage(this.storageKey('favorites'), this.favoriteIds())
    this.writeStorage(this.storageKey('pinned'), this.pinnedIds())
    this.writeStorage(this.storageKey('recents'), this.recentKnowledgebases())
    this.writeStorage(this.storageKey('sections'), this.sectionVisibility())
    this.writeStorage(this.storageKey('scope-rail-width-v2'), this.scopeRailWidth())
  }

  private storageKey(kind: 'favorites' | 'pinned' | 'recents' | 'sections' | 'scope-rail-width-v2') {
    const userId = this.#store.user?.id || 'anonymous'
    return `xpert:knowledge:${userId}:${this.#preferencesWorkspaceId}:${kind}`
  }

  private readStorage<T>(key: string, fallback: T): T {
    try {
      const value = localStorage.getItem(key)
      return value ? (JSON.parse(value) as T) : fallback
    } catch {
      return fallback
    }
  }

  private writeStorage(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Local preferences should never block the knowledge-base workflow.
    }
  }

  private normalizeScopeRailWidth(width: number) {
    return Number.isFinite(width)
      ? Math.min(SCOPE_RAIL_MAX_WIDTH, Math.max(SCOPE_RAIL_MIN_WIDTH, Math.round(width)))
      : SCOPE_RAIL_DEFAULT_WIDTH
  }

  private hydrateCardStatistics(items: IKnowledgebase[]) {
    if (!items.length) {
      return Promise.resolve([] as KnowledgebaseCardItem[])
    }

    return firstValueFrom(
      forkJoin(
        items.map((item) =>
          forkJoin({
            detail: item.id
              ? this.#knowledgebaseService.getDetail(String(item.id)).pipe(
                  take(1),
                  catchError(() => of(null))
                )
              : of(null),
            folders: item.id
              ? this.#knowledgeDocumentService
                  .getAll({
                    select: ['id'],
                    where: {
                      knowledgebaseId: String(item.id),
                      sourceType: KDocumentSourceType.FOLDER
                    },
                    take: 1
                  })
                  .pipe(catchError(() => of(null)))
              : of(null),
            documents: item.id
              ? this.#knowledgeDocumentService
                  .getAll({
                    select: ['id'],
                    where: {
                      knowledgebaseId: String(item.id),
                      sourceType: { $ne: KDocumentSourceType.FOLDER }
                    },
                    take: 1
                  })
                  .pipe(catchError(() => of(null)))
              : of(null)
          }).pipe(
            map(({ detail, folders, documents }) => ({
              ...item,
              ...(detail ?? {}),
              documentNum: documents?.total ?? detail?.documentNum ?? item.documentNum ?? null,
              chunkNum: detail?.chunkNum ?? item.chunkNum ?? null,
              folderNum: folders?.total ?? null
            }))
          )
        )
      )
    )
  }
}
