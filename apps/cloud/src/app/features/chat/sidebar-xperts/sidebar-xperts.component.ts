import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { NavigationEnd, Router } from '@angular/router'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar/emoji-avatar/avatar.component'
import { AssistantBindingScope, AssistantBindingService, AssistantCode, IXpert, Store } from '../../../@core'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
import { of } from 'rxjs'
import { catchError, filter, map, startWith, switchMap } from 'rxjs/operators'
import { ChatHomeService } from '../home.service'

type SidebarXpertState = {
  items: IXpert[]
  loading: boolean
}

@Component({
  standalone: true,
  selector: 'pac-chat-sidebar-xperts',
  imports: [CommonModule, EmojiAvatarComponent, ...ZardTooltipImports],
  template: `
    @if (xperts().length) {
      <div
        data-chat-sidebar-xperts
        [attr.data-state]="sidebarState()"
        class="px-1.5 pb-2 transition-[padding,opacity] duration-200"
        (click)="$event.stopPropagation()"
      >
        <div
          class="flex min-w-0 gap-1.5"
          [ngClass]="sidebarState() === 'expanded' ? 'flex-col px-1 pt-1' : 'flex-col items-center px-0 pt-0.5'"
        >
          @for (xpert of xperts(); track xpert.id) {
            <button
              data-sidebar-xpert-avatar
              type="button"
              class="group/sidebar-xpert relative flex shrink-0 overflow-hidden border border-transparent text-text-primary transition-[width,height,padding,border-color,background-color,box-shadow,transform] hover:bg-hover-bg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              [attr.data-xpert-id]="xpert.id"
              [attr.data-active]="isActive(xpert)"
              [ngClass]="[
                sidebarState() === 'expanded'
                  ? 'min-h-14 w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left'
                  : 'h-10 w-10 items-center justify-center rounded-2xl',
                isActive(xpert)
                  ? 'border-primary bg-components-card-bg shadow-sm'
                  : 'bg-background-default-subtle hover:border-border'
              ]"
              [zTooltip]="xpertLabel(xpert)"
              zPosition="right"
              (click)="openXpert($event, xpert)"
            >
              <emoji-avatar
                class="block shrink-0 overflow-hidden rounded-[inherit]"
                [ngClass]="sidebarState() === 'expanded' ? 'h-9 w-9 rounded-xl' : 'h-full w-full'"
                [avatar]="xpert.avatar"
                [alt]="xpertLabel(xpert)"
                [fallbackLabel]="xpertLabel(xpert)"
              />
              @if (sidebarState() === 'expanded') {
                <span class="flex min-w-0 flex-1 flex-col">
                  <span data-sidebar-xpert-title class="truncate text-sm font-medium leading-5 text-text-primary">
                    {{ xpertLabel(xpert) }}
                  </span>
                  <span
                    data-sidebar-xpert-description
                    class="mt-0.5 line-clamp-2 text-xs leading-4 text-text-secondary"
                  >
                    {{ xpertDescription(xpert) }}
                  </span>
                </span>
              }
              <span
                class="pointer-events-none absolute right-1 top-1 h-2 w-2 rounded-full bg-primary opacity-0 transition-opacity"
                [class.opacity-100]="isActive(xpert)"
              ></span>
            </button>
          }
        </div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatSidebarXpertsComponent {
  readonly sidebarState = input<'expanded' | 'closed'>('expanded')

  readonly #assistantBindingService = inject(AssistantBindingService)
  readonly #homeService = inject(ChatHomeService)
  readonly #router = inject(Router)
  readonly #store = inject(Store)

  readonly organizationId = toSignal(this.#store.selectOrganizationId(), {
    initialValue: this.#store.organizationId ?? null
  })
  readonly currentUrl = toSignal(
    this.#router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      startWith(null),
      map(() => normalizeChatPath(this.#router.url))
    ),
    { initialValue: normalizeChatPath(this.#router.url) }
  )
  readonly state = toSignal(
    toObservable(this.organizationId).pipe(
      switchMap((organizationId) => {
        if (!organizationId) {
          return of({ items: [], loading: false } satisfies SidebarXpertState)
        }

        return this.#assistantBindingService
          .getAvailableXperts(AssistantBindingScope.USER, AssistantCode.CLAWXPERT)
          .pipe(
            map((items) => ({ items: normalizeXperts(items), loading: false }) satisfies SidebarXpertState),
            startWith({ items: [], loading: true } satisfies SidebarXpertState),
            catchError(() => of({ items: [], loading: false } satisfies SidebarXpertState))
          )
      })
    ),
    { initialValue: { items: [], loading: false } satisfies SidebarXpertState }
  )
  readonly xperts = computed(() => this.state().items)

  openXpert(event: Event, xpert: IXpert) {
    event.stopPropagation()
    const routeId = xpert.slug || xpert.id
    if (!routeId) {
      return
    }

    this.#homeService.conversationId.set(null)
    this.#homeService.conversation.set(null)
    void this.#router.navigate(['/chat/x', routeId, 'c'])
  }

  isActive(xpert: IXpert) {
    const routeId = xpert.slug || xpert.id
    return !!routeId && this.currentUrl().startsWith(`/chat/x/${encodeURIComponent(routeId)}/c`)
  }

  xpertLabel(xpert: IXpert) {
    return xpert.title || xpert.titleCN || xpert.name || xpert.slug || xpert.id || ''
  }

  xpertDescription(xpert: IXpert) {
    const description = xpert.description?.trim()
    if (description) {
      return description
    }

    const name = xpert.name?.trim()
    const label = this.xpertLabel(xpert)
    if (name && name !== label) {
      return name
    }

    return xpert.slug || xpert.id || ''
  }
}

function normalizeChatPath(url: string) {
  const [pathname] = (url || '/chat').split('?')
  if (!pathname || pathname === '/') {
    return '/chat'
  }

  return pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname
}

function normalizeXperts(items: IXpert[] | { items?: IXpert[] } | null | undefined) {
  const seen = new Set<string>()
  const candidates = Array.isArray(items) ? items : Array.isArray(items?.items) ? items.items : []

  return candidates.filter((xpert): xpert is IXpert => {
    if (!xpert?.id || xpert.latest === false || seen.has(xpert.id)) {
      return false
    }

    seen.add(xpert.id)
    return true
  })
}
