import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { NavigationEnd, Router, RouterModule } from '@angular/router'
import { routeAnimations } from '@xpert-ai/core'
import { filter, map, startWith } from 'rxjs/operators'
import { AiFeatureEnum, Store } from '../../../@core'
import { XpertHomeService } from '../../../xpert'
import { ClawXpertFacade } from '../clawxpert/clawxpert.facade'
import { ChatHomeService } from '../home.service'

@Component({
  standalone: true,
  imports: [RouterModule],
  selector: 'pac-chat-home',
  templateUrl: './home.component.html',
  styleUrl: 'home.component.scss',
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    ClawXpertFacade,
    ChatHomeService,
    {
      provide: XpertHomeService,
      useExisting: ChatHomeService
    }
  ]
})
export class ChatHomeComponent {
  readonly #homeService = inject(ChatHomeService)
  readonly #router = inject(Router)
  readonly #store = inject(Store)

  readonly currentPage = signal<{ type?: 'project' | 'conversation'; id?: string }>({})
  readonly historyExpanded = signal(true)

  readonly currentUrl = toSignal(
    this.#router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      startWith(null),
      map(() => normalizeChatRoute(this.#router.url))
    ),
    { initialValue: normalizeChatRoute(this.#router.url) }
  )
  readonly featureContextHydrated = toSignal(this.#store.featureContextHydrated$, {
    initialValue: this.#store.featureContextHydrated
  })
  readonly featureContextHydrationLoading = toSignal(this.#store.featureContextHydrationLoading$, {
    initialValue: this.#store.featureContextHydrationLoading
  })
  readonly isCommonAssistantRoute = computed(() => {
    const url = this.currentUrl()
    return url === '/chat' || url === '/chat/x/common' || url.startsWith('/chat/x/common/')
  })

  constructor() {
    effect(() => {
      if (
        !this.featureContextHydrated() ||
        this.featureContextHydrationLoading() ||
        !isClawXpertRoute(this.currentUrl()) ||
        this.clawxpertEnabled()
      ) {
        return
      }

      void this.#router.navigateByUrl('/chat/tasks')
    })

    effect(() => {
      if (!this.isCommonAssistantRoute()) {
        return
      }

      if (this.#homeService.conversationId()) {
        this.#homeService.conversationId.set(null)
      }

      if (this.#homeService.conversation()) {
        this.#homeService.conversation.set(null)
      }
    })
  }

  private clawxpertEnabled() {
    return (
      this.#store.hasFeatureEnabled(AiFeatureEnum.FEATURE_XPERT) &&
      this.#store.hasFeatureEnabled(AiFeatureEnum.FEATURE_XPERT_CLAWXPERT)
    )
  }
}

function normalizeChatRoute(url: string) {
  const [pathname] = (url || '/chat').split('?')
  if (!pathname || pathname === '/') {
    return '/chat'
  }

  return pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname
}

function isClawXpertRoute(url: string) {
  return /^\/chat\/clawxpert(?:\/|$)/.test(normalizeChatRoute(url))
}
