import { A11yModule } from '@angular/cdk/a11y'
import { ConnectedPosition, OverlayModule } from '@angular/cdk/overlay'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { NavigationEnd, Router, RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { catchError, filter, map, merge, of, startWith, switchMap, tap } from 'rxjs'
import {
  AssistantBindingScope,
  AssistantBindingService,
  AssistantCode,
  ChatConversationService,
  IChatConversation
} from '../../@core'

import { CloudSidebarConversationComponent } from './cloud-sidebar-conversation.component'

import { SidebarConversationArchiveButtonComponent } from './conversation-archive.component'

const RECENT_TASK_LIMIT = 10

@Component({
  standalone: true,
  selector: 'xp-cloud-sidebar-recent-tasks',
  templateUrl: './cloud-sidebar-recent-tasks.component.html',
  styleUrl: './cloud-sidebar-recent-tasks.component.scss',
  imports: [
    CommonModule,
    A11yModule,
    OverlayModule,
    RouterModule,
    TranslateModule,
    CloudSidebarConversationComponent,
    SidebarConversationArchiveButtonComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CloudSidebarRecentTasksComponent {
  readonly collapsed = input(false)
  readonly expanded = signal(false)
  readonly menuOpen = signal(false)
  readonly xpertId = signal<string | null>(null)
  readonly menuPositions: ConnectedPosition[] = [
    { originX: 'end', originY: 'top', overlayX: 'start', overlayY: 'top', offsetX: 8 },
    { originX: 'end', originY: 'bottom', overlayX: 'start', overlayY: 'bottom', offsetX: 8 },
    { originX: 'start', originY: 'top', overlayX: 'end', overlayY: 'top', offsetX: -8 }
  ]

  readonly #assistantBindingService = inject(AssistantBindingService)
  readonly #conversationService = inject(ChatConversationService)
  readonly #router = inject(Router)
  readonly conversations = toSignal(
    merge(
      of(null),
      this.#assistantBindingService.changes$.pipe(
        filter((event) => event.code === AssistantCode.CLAWXPERT && event.scope === AssistantBindingScope.USER)
      ),
      this.#conversationService.unreadRefresh$,
      this.#router.events.pipe(
        filter((event) => event instanceof NavigationEnd),
        tap(() => this.menuOpen.set(false))
      )
    ).pipe(
      switchMap(() =>
        this.#assistantBindingService.get(AssistantCode.CLAWXPERT, AssistantBindingScope.USER).pipe(
          switchMap((binding) => {
            const xpertId = binding?.assistantId?.trim()
            this.xpertId.set(xpertId || null)
            if (!xpertId) {
              return of([] as IChatConversation[])
            }

            return this.#conversationService.getSidebarConversations(xpertId, RECENT_TASK_LIMIT).pipe(
              map(({ items }) =>
                (items ?? [])
                  .filter((conversation) => !!conversation?.threadId)
                  .sort(
                    (left, right) =>
                      Number(!!right.sidebar?.pinned) - Number(!!left.sidebar?.pinned) ||
                      toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt)
                  )
                  .slice(0, RECENT_TASK_LIMIT)
              )
            )
          }),
          catchError(() => of([] as IChatConversation[]))
        )
      ),
      startWith([] as IChatConversation[])
    ),
    { initialValue: [] as IChatConversation[] }
  )

  constructor() {
    effect(() => {
      if (!this.collapsed()) this.menuOpen.set(false)
    })
  }

  toggleExpanded() {
    this.expanded.update((expanded) => !expanded)
  }

  isTaskActive(conversation: IChatConversation) {
    return this.#router.url?.split('?')[0] === `/chat/clawxpert/c/${encodeURIComponent(conversation.threadId)}`
  }

  taskRoute(conversation: IChatConversation) {
    const threadId = conversation.threadId?.trim()
    return threadId ? ['/chat/clawxpert', 'c', threadId] : null
  }
}

function toTimestamp(value: Date | string | number | null | undefined) {
  const timestamp = value instanceof Date ? value.getTime() : value ? new Date(value).getTime() : 0
  return Number.isFinite(timestamp) ? timestamp : 0
}
