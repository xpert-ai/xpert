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
import { Dialog } from '@angular/cdk/dialog'
import type { ChatGroupSummary } from '@xpert-ai/contracts'
import { ChatGroupService } from '../../../@core/services/chat-group.service'
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
          [placeholder]="'XP.Assistant.Search' | translate"
          [attr.aria-label]="'XP.Assistant.Search' | translate"
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
        @for (group of filteredGroups(); track group.id) {
          <div class="flex items-center gap-1 rounded-lg hover:bg-hover-bg">
            <button
              z-menu-item
              type="button"
              [attr.data-group-option]="group.id"
              [attr.aria-current]="group.id === activeId() ? 'page' : null"
              class="min-w-0 flex-1"
              (click)="selectGroup(group.id)"
            >
              <span class="grid size-7 shrink-0 grid-cols-2 grid-rows-2" aria-hidden="true">
                @for (member of group.members.slice(0, 4); track member.id) {
                  <emoji-avatar
                    [avatar]="member.avatar ?? undefined"
                    [alt]="member.name"
                    [fallbackLabel]="member.name"
                    class="!size-4 overflow-hidden rounded-md ring-1 ring-components-card-bg"
                  />
                }
              </span>
              <span class="truncate" [class.font-semibold]="group.unread">{{ group.title }}</span>
              @if (group.pinned) {
                <i class="ri-pushpin-line text-text-tertiary" aria-hidden="true"></i>
              }
            </button>
            <button
              z-menu
              type="button"
              [zMenuTriggerFor]="groupOptions"
              class="size-7 shrink-0"
              [attr.aria-label]="'XP.Groups.Options' | translate"
            >
              <i class="ri-more-line"></i>
            </button>
            <ng-template #groupOptions
              ><div z-menu-content class="w-40">
                <button z-menu-item (click)="preferences(group, { pinned: !group.pinned })">
                  {{ (group.pinned ? 'XP.Groups.Unpin' : 'XP.Groups.Pin') | translate }}
                </button>
                <button z-menu-item (click)="preferences(group, { archived: !group.archived })">
                  {{ (group.archived ? 'XP.Groups.Restore' : 'XP.Groups.Archive') | translate }}
                </button>
              </div></ng-template
            >
          </div>
        }
        @if (groupsFailed()) {
          <button z-menu-item type="button" (click)="loadGroups()">{{ 'XP.KEY_WORDS.Retry' | translate }}</button>
        }
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
              class="relative flex h-9 min-w-0 items-center gap-2 rounded-lg px-2 py-1 hover:bg-hover-bg focus-within:bg-hover-bg"
            >
              <button
                z-menu-item
                type="button"
                [attr.data-assistant-option]="assistant.id"
                [attr.aria-current]="assistant.id === activeId() ? 'page' : null"
                class="absolute! inset-0 h-full w-full rounded-lg"
                (click)="select(assistant)"
                (keydown.tab)="$event.stopPropagation()"
              >
                <span class="sr-only">{{ label(assistant) }}</span>
              </button>
              <emoji-avatar
                [avatar]="assistant.avatar"
                [alt]="label(assistant)"
                [fallbackLabel]="label(assistant)"
                aria-hidden="true"
                class="pointer-events-none relative !size-[24px] shrink-0 overflow-hidden rounded-xl"
              />
              <span
                class="pointer-events-none relative flex min-w-0 flex-1 items-center text-sm"
                [title]="label(assistant)"
              >
                @if (businessArea(assistant); as area) {
                  <button
                    type="button"
                    [attr.data-assistant-business-area]="area.id"
                    class="pointer-events-auto relative min-w-0 max-w-[48%] shrink truncate rounded-sm bg-transparent p-0 text-left text-text-secondary underline-offset-2 hover:text-primary hover:underline focus-visible:text-primary focus-visible:underline focus-visible:outline-none aria-pressed:text-primary aria-pressed:underline"
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
                  <span
                    class="shrink-0 whitespace-pre text-text-tertiary"
                    aria-hidden="true"
                    [textContent]="' / '"
                  ></span>
                }
                <span class="min-w-0 truncate text-text-primary" aria-hidden="true">{{ name(assistant) }}</span>
              </span>
              @if (assistant.id === activeId()) {
                <i class="pointer-events-none relative ri-check-line shrink-0 text-text-primary" aria-hidden="true"></i>
              }
            </div>
          } @empty {
            @if (!filteredGroups().length) {
              <p role="status" class="px-3 py-5 text-sm text-text-tertiary">
                {{ 'XP.Chat.ClawXpert.NoMatches' | translate: { Default: 'No assistants match your current search.' } }}
              </p>
            }
          }
        }
      </div>
      @if (canUseGroups()) {
        <div class="shrink-0 border-t border-divider-subtle pt-1">
          <button z-menu-item type="button" data-create-group (click)="createGroup()">
            <i class="ri-group-line"></i>{{ 'XP.Groups.New' | translate }}
          </button>
          <button z-menu-item type="button" (click)="showArchived.set(!showArchived())">
            {{ (showArchived() ? 'XP.Groups.Active' : 'XP.Groups.Archived') | translate }}
          </button>
        </div>
      }
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
  readonly groups = signal<ChatGroupSummary[]>([])
  readonly groupsFailed = signal(false)
  readonly showArchived = signal(false)
  readonly canUseGroups = computed(() => this.#scope.activeScope().level === RequestScopeLevel.ORGANIZATION)
  readonly filteredGroups = computed(() =>
    this.businessAreaFilter()
      ? []
      : this.groups()
          .filter(
            (group) =>
              group.archived === this.showArchived() &&
              group.title.toLowerCase().includes(this.query().trim().toLowerCase())
          )
          .sort((a, b) => Number(b.pinned) - Number(a.pinned))
  )
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
  readonly #groups = inject(ChatGroupService)
  readonly #dialog = inject(Dialog)
  readonly #scope = inject(ScopeService)
  readonly #store = inject(Store)
  readonly #router = inject(Router)
  readonly #destroyRef = inject(DestroyRef)
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef)
  readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('search')

  constructor() {
    void this.load()
    void this.loadGroups()
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
      this.#element.nativeElement
        .querySelector<HTMLButtonElement>('[data-group-option], [data-assistant-option]')
        ?.focus()
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

  async loadGroups() {
    if (!this.canUseGroups()) return
    this.groupsFailed.set(false)
    try {
      const groups = await firstValueFrom(this.#groups.list().pipe(takeUntilDestroyed(this.#destroyRef)))
      if (!this.#destroyRef.destroyed) this.groups.set(groups)
    } catch {
      if (!this.#destroyRef.destroyed) this.groupsFailed.set(true)
    }
  }

  async selectGroup(id: string) {
    if (id === this.activeId()) {
      this.selected.emit()
      return
    }
    try {
      const commands = await firstValueFrom(this.#groups.conversationRoute(id))
      this.selected.emit()
      await this.#router.navigate(commands)
    } catch {
      this.groupsFailed.set(true)
    }
  }

  async preferences(group: ChatGroupSummary, preferences: { pinned?: boolean; archived?: boolean }) {
    try {
      await firstValueFrom(this.#groups.preferences(group.id, preferences))
      await this.loadGroups()
    } catch {
      this.groupsFailed.set(true)
    }
  }

  async createGroup() {
    const { GroupCreateDialogComponent } = await import('../groups/group-create-dialog.component')
    const ref = this.#dialog.open<string>(GroupCreateDialogComponent, {
      backdropClass: 'backdrop-blur-xs-black',
      panelClass: 'xp-overlay-pane-dialog'
    })
    // The dialog outlives the menu that opened it.
    ref.closed.subscribe((id) => {
      if (id) void this.selectGroup(id)
    })
    this.selected.emit()
  }
}
