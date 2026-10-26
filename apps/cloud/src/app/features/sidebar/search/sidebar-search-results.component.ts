import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { RouterLink } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { combineLatest, distinctUntilChanged, map, Subscription, take, timeout } from 'rxjs'
import { Store } from '../../../@core'
import { SidebarSearchService } from '../../../@core/services/sidebar-search.service'
import { SidebarSearchContext, SidebarSearchPage, SidebarSearchSource } from './sidebar-search.types'

@Component({
  standalone: true,
  selector: 'xp-sidebar-search-results',
  imports: [RouterLink, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="mt-3 min-w-0"
      [attr.aria-label]="'XP.Sidebar.Search.' + source() | translate"
      [attr.aria-busy]="loading()"
      [attr.data-search-source]="source()"
    >
      <h3 class="px-3 py-2 text-sm font-medium text-muted-foreground">
        {{ 'XP.Sidebar.Search.' + source() | translate }}
      </h3>
      @for (item of page().items; track item.id) {
        <a
          class="flex min-h-10 min-w-0 items-center gap-2.5 rounded-lg px-3 py-2 text-base text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-primary focus-visible:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          [routerLink]="item.route"
          [queryParams]="item.queryParams"
          [title]="item.title"
        >
          <i
            class="inline-flex size-[24px] shrink-0 items-center justify-center text-[20px] leading-none"
            [class]="item.icon"
            aria-hidden="true"
          ></i>
          <span class="min-w-0 flex-1">
            <span class="block truncate">{{ item.title }}</span>
            @if (item.description) {
              <span class="block truncate text-xs text-muted-foreground">{{ item.description }}</span>
            }
          </span>
        </a>
      }
      @if (loading()) {
        <p role="status" class="px-3 py-2 text-sm text-muted-foreground">
          {{ 'XP.Sidebar.Search.Loading' | translate }}
        </p>
      } @else if (error()) {
        <p role="alert" class="px-3 py-2 text-sm text-text-destructive">{{ 'XP.Sidebar.Search.Error' | translate }}</p>
        <button
          type="button"
          class="mx-3 rounded-lg px-2 py-1 text-sm text-text-secondary hover:bg-hover-bg hover:text-text-primary"
          (click)="loadMore()"
        >
          {{ 'XP.Common.ErrorState.Retry' | translate }}
        </button>
      } @else if (!page().items.length) {
        <p role="status" class="px-3 py-2 text-sm text-muted-foreground">{{ 'XP.Sidebar.Search.Empty' | translate }}</p>
      }
      @if (page().incomplete) {
        <p role="status" class="px-3 py-2 text-sm text-muted-foreground">
          {{ 'XP.Sidebar.Search.Partial' | translate }}
        </p>
      }
      @if (!loading() && !error() && hasMore()) {
        <button
          type="button"
          class="mx-3 rounded-lg px-2 py-2 text-sm text-text-secondary hover:bg-hover-bg hover:text-text-primary"
          (click)="loadMore()"
        >
          {{ 'XP.Sidebar.Search.More' | translate }}
        </button>
      }
    </section>
  `
})
export class SidebarSearchResultsComponent {
  readonly source = input.required<SidebarSearchSource>()
  readonly query = input.required<string>()
  readonly context = input<SidebarSearchContext>({})
  readonly page = signal<SidebarSearchPage>({ items: [], total: 0 })
  readonly loading = signal(false)
  readonly error = signal(false)
  readonly hasMore = signal(false)
  private readonly api = inject(SidebarSearchService)
  private readonly store = inject(Store)
  private readonly language = toSignal(inject(TranslateService).onLangChange)
  private readonly scope = toSignal(
    combineLatest([this.store.user$, this.store.selectOrganizationId(), this.store.selectActiveScope()]).pipe(
      map(([user, organizationId, scope]) => ({
        userId: user?.id,
        tenantId: user?.tenantId,
        organizationId,
        level: scope.level
      })),
      distinctUntilChanged(
        (a, b) =>
          a.userId === b.userId &&
          a.tenantId === b.tenantId &&
          a.organizationId === b.organizationId &&
          a.level === b.level
      )
    )
  )
  private subscription?: Subscription
  private generation = 0
  private offset = 0
  private pending?: { source: SidebarSearchSource; query: string; context: SidebarSearchContext }

  constructor() {
    effect((onCleanup) => {
      const source = this.source()
      const query = this.query().trim()
      const context = this.context()
      const scope = this.scope()
      this.language()
      const generation = ++this.generation
      this.subscription?.unsubscribe()
      this.offset = 0
      this.page.set({ items: [], total: 0 })
      this.error.set(false)
      this.hasMore.set(false)
      this.pending = query && scope?.userId ? { source, query, context } : undefined
      this.loading.set(!!this.pending)
      // Invalidate immediately; debounce only the new request so an old result cannot flash under a new query.
      const timer = setTimeout(
        () =>
          untracked(() => {
            if (generation === this.generation) this.loadMore()
          }),
        250
      )
      onCleanup(() => {
        clearTimeout(timer)
        this.subscription?.unsubscribe()
        this.generation++
      })
    })
  }

  loadMore() {
    if (!this.pending || (this.subscription && !this.subscription.closed)) return
    const generation = this.generation
    const { source, query, context } = this.pending
    this.loading.set(true)
    this.error.set(false)
    this.subscription = this.api
      .search(source, query, this.offset, context)
      .pipe(take(1), timeout(30000))
      .subscribe({
        next: (page) => {
          if (generation !== this.generation) return
          const items = new Map([...this.page().items, ...page.items].map((item) => [item.id, item]))
          this.offset += page.items.length
          this.hasMore.set(page.items.length > 0 && this.offset < page.total)
          this.page.set({ ...page, items: [...items.values()] })
          this.loading.set(false)
        },
        error: () => {
          if (generation !== this.generation) return
          this.error.set(true)
          this.loading.set(false)
        }
      })
  }
}
