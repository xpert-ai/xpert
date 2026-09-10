import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { ZardMenuImports } from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import {
  AssistantBindingScope,
  AssistantBindingService,
  AssistantCode,
  IXpert,
  RequestScopeLevel,
  ScopeService,
  Store
} from '../../../@core'
import { EmojiAvatarComponent } from '../../../@shared/avatar/emoji-avatar/avatar.component'
import {
  filterAssistantXperts,
  getAssistantBusinessArea,
  getAssistantLabel,
  getAssistantName,
  getAssistantRouteId,
  normalizeAssistantXperts,
  orderAssistantXperts,
  readAssistantOrder,
  type AssistantBusinessArea
} from '../../sidebar/cloud-sidebar-assistants.utils'

@Component({
  selector: 'xp-workbench-assistant-menu',
  imports: [TranslateModule, EmojiAvatarComponent, ...ZardMenuImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      z-menu-content
      data-workbench-assistant-menu
      class="flex max-h-[min(400px,calc(100dvh-76px))] w-80 max-w-[calc(100vw-16px)] flex-col overflow-hidden p-1"
    >
      <div class="flex shrink-0 items-center gap-2 border-b border-divider-subtle px-3 py-2">
        <i class="ri-search-line text-text-tertiary" aria-hidden="true"></i>
        <input
          #search
          type="search"
          data-assistant-search
          class="h-8 min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-tertiary"
          [placeholder]="'XP.Chat.WorkbenchPresentation.SearchAssistants' | translate"
          [attr.aria-label]="'XP.Chat.WorkbenchPresentation.SearchAssistants' | translate"
          [value]="query()"
          (input)="query.set(search.value)"
          (keydown)="handleSearchKey($event)"
        />
      </div>
      @if (businessAreaFilter(); as area) {
        <div class="flex shrink-0 items-center px-2 pt-1.5">
          <button
            type="button"
            data-clear-business-area
            class="flex max-w-full items-center gap-1 rounded-md bg-hover-bg px-2 py-1 text-xs text-text-primary focus-visible:outline-2 focus-visible:outline-primary"
            [attr.aria-label]="
              ('XP.Sidebar.ClearBusinessAreaFilter' | translate: { Default: 'Clear business area filter' }) +
              ': ' +
              area.name
            "
            (click)="setBusinessAreaFilter($event, null)"
            (keydown)="handleFilterKey($event)"
          >
            <span class="truncate">{{ area.name }}</span>
            <i class="ri-close-line shrink-0" aria-hidden="true"></i>
          </button>
        </div>
      }
      <div data-assistant-options class="min-h-0 overflow-y-auto overscroll-contain py-1" [attr.aria-busy]="loading()">
        @if (loading()) {
          <p role="status" class="px-3 py-5 text-sm text-text-tertiary">
            {{ 'XP.Common.Loading' | translate: { Default: 'Loading...' } }}
          </p>
        } @else if (failed()) {
          <p role="alert" class="px-3 pt-3 text-sm text-text-secondary">
            {{ 'XP.Chat.WorkbenchPresentation.AssistantsLoadFailed' | translate }}
          </p>
          <button
            type="button"
            class="mx-3 my-2 rounded-md px-3 py-2 text-sm hover:bg-hover-bg focus-visible:ring-2 focus-visible:ring-primary"
            (click)="load()"
          >
            {{ 'XP.KEY_WORDS.Retry' | translate: { Default: 'Retry' } }}
          </button>
        } @else {
          @for (assistant of filtered(); track assistant.id) {
            <div
              data-assistant-row
              class="flex min-w-0 items-center rounded-lg hover:bg-hover-bg focus-within:bg-hover-bg"
            >
              <button
                z-menu-item
                type="button"
                [attr.data-assistant-option]="assistant.id"
                [attr.aria-current]="assistant.id === activeId() ? 'page' : null"
                class="flex h-9 min-w-0 flex-1 items-center gap-2 px-2 py-1 text-left"
                (click)="select(assistant)"
                (keydown.tab)="$event.stopPropagation()"
              >
                <emoji-avatar
                  [avatar]="assistant.avatar"
                  [alt]="label(assistant)"
                  [fallbackLabel]="label(assistant)"
                  class="!size-[24px] shrink-0 overflow-hidden rounded-xl"
                />
                <span class="min-w-0 flex-1 truncate" [title]="label(assistant)">{{ name(assistant) }}</span>
                @if (assistant.id === activeId()) {
                  <i class="ri-check-line shrink-0 text-text-primary" aria-hidden="true"></i>
                }
              </button>
              @if (businessArea(assistant); as area) {
                <button
                  type="button"
                  [attr.data-assistant-business-area]="area.id"
                  class="mr-2 max-w-[5.5rem] shrink-0 truncate rounded-md bg-background-default-subtle px-1.5 py-0.5 text-xs text-text-secondary hover:bg-hover-bg hover:text-text-primary focus-visible:outline-2 focus-visible:outline-primary"
                  [title]="area.name"
                  [attr.aria-label]="
                    ('XP.Sidebar.FilterByBusinessArea' | translate: { Default: 'Filter by business area' }) +
                    ': ' +
                    area.name
                  "
                  [attr.aria-pressed]="businessAreaFilter()?.id === area.id"
                  (click)="setBusinessAreaFilter($event, area)"
                  (keydown)="handleFilterKey($event)"
                >
                  {{ area.name }}
                </button>
              }
            </div>
          } @empty {
            <p role="status" class="px-3 py-5 text-sm text-text-tertiary">
              {{ 'XP.Chat.ClawXpert.NoMatches' | translate: { Default: 'No assistants match your current search.' } }}
            </p>
          }
        }
      </div>
    </div>
  `
})
export class WorkbenchAssistantMenuComponent {
  readonly activeId = input<string | null>(null)
  readonly selected = output<void>()
  readonly query = signal('')
  readonly loading = signal(false)
  readonly failed = signal(false)
  readonly assistants = signal<IXpert[]>([])
  readonly businessAreaFilter = signal<AssistantBusinessArea | null>(null)
  readonly filtered = computed(() => {
    const items = filterAssistantXperts(this.assistants(), this.query())
    const area = this.businessAreaFilter()
    return area ? items.filter((assistant) => getAssistantBusinessArea(assistant)?.id === area.id) : items
  })
  readonly businessArea = getAssistantBusinessArea
  readonly name = getAssistantName
  readonly label = getAssistantLabel
  readonly #api = inject(AssistantBindingService)
  readonly #scope = inject(ScopeService)
  readonly #store = inject(Store)
  readonly #router = inject(Router)
  readonly #destroyRef = inject(DestroyRef)
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef)
  readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('search')

  constructor() {
    void this.load()
    afterNextRender(() => this.searchInput()?.nativeElement.focus())
  }

  async load() {
    this.loading.set(true)
    this.failed.set(false)
    const scope = this.#scope.activeScope()
    const tenant = scope.level === RequestScopeLevel.TENANT
    try {
      const items = await firstValueFrom(
        this.#api
          .getAvailableXperts(
            tenant ? AssistantBindingScope.TENANT : AssistantBindingScope.USER,
            tenant ? AssistantCode.CHAT_COMMON : AssistantCode.CLAWXPERT
          )
          .pipe(takeUntilDestroyed(this.#destroyRef))
      )
      const userId = this.#store.user?.id ?? this.#store.userId ?? 'anonymous'
      const scopeId = this.#store.organizationId ?? scope.level
      const order = readAssistantOrder(`xpert.cloud-sidebar.assistant-order:${userId}:${scope.level}:${scopeId}`)
      this.assistants.set(orderAssistantXperts(normalizeAssistantXperts(items), order))
    } catch {
      if (!this.#destroyRef.destroyed) this.failed.set(true)
    } finally {
      if (!this.#destroyRef.destroyed) this.loading.set(false)
    }
  }

  handleSearchKey(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      this.#element.nativeElement.querySelector<HTMLButtonElement>('[data-assistant-option]')?.focus()
    }
    if (event.key !== 'Escape') event.stopPropagation()
  }

  setBusinessAreaFilter(event: Event, area: AssistantBusinessArea | null) {
    event.stopPropagation()
    this.businessAreaFilter.set(area)
    if (!area) this.searchInput()?.nativeElement.focus()
  }

  handleFilterKey(event: KeyboardEvent) {
    if (event.key !== 'Escape') event.stopPropagation()
  }

  select(assistant: IXpert) {
    this.selected.emit()
    if (assistant.id !== this.activeId()) void this.#router.navigate(['/chat/x', getAssistantRouteId(assistant), 'c'])
  }
}
