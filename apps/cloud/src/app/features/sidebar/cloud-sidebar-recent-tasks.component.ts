import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { NavigationEnd, Router, RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
import { catchError, filter, map, merge, of, startWith, switchMap } from 'rxjs'
import {
  AssistantBindingScope,
  AssistantBindingService,
  AssistantCode,
  ChatConversationService,
  DateRelativePipe,
  IChatConversation,
  OrderTypeEnum
} from '../../@core'

const RECENT_TASK_LIMIT = 10

@Component({
  standalone: true,
  selector: 'xp-cloud-sidebar-recent-tasks',
  templateUrl: './cloud-sidebar-recent-tasks.component.html',
  styleUrl: './cloud-sidebar-recent-tasks.component.scss',
  imports: [CommonModule, RouterModule, TranslateModule, DateRelativePipe, ...ZardTooltipImports],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CloudSidebarRecentTasksComponent {
  readonly collapsed = input(false)
  readonly expanded = signal(false)

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
      this.#router.events.pipe(filter((event) => event instanceof NavigationEnd))
    ).pipe(
      switchMap(() =>
        this.#assistantBindingService.get(AssistantCode.CLAWXPERT, AssistantBindingScope.USER).pipe(
          switchMap((binding) => {
            const xpertId = binding?.assistantId?.trim()
            if (!xpertId) {
              return of([] as IChatConversation[])
            }

            return this.#conversationService
              .getMyInOrg({
                select: ['id', 'threadId', 'title', 'updatedAt', 'xpertId'],
                order: { updatedAt: OrderTypeEnum.DESC },
                take: RECENT_TASK_LIMIT,
                where: {
                  xpertId
                }
              })
              .pipe(
                map(({ items }) =>
                  (items ?? [])
                    .filter((conversation) => !!conversation?.threadId)
                    .sort((left, right) => toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt))
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

  readonly shouldRender = computed(() => !this.collapsed())

  toggleExpanded() {
    this.expanded.update((expanded) => !expanded)
  }

  taskTitle(conversation: IChatConversation) {
    return conversation.title?.trim() || 'Untitled conversation'
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
