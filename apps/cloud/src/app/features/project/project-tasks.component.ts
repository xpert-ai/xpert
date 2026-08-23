import { CommonModule } from '@angular/common'
import { Component, computed, inject, OnInit, signal } from '@angular/core'
import { ActivatedRoute, RouterLink } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import type { IChatConversation } from '@xpert-ai/contracts'
import {
  ZardButtonComponent,
  ZardDialogService,
  ZardInputDirective,
  ZardToggleGroupComponent,
  ZardToggleGroupItemComponent
} from '@xpert-ai/headless-ui'
import { XpertProjectFacade } from './project.facade'
import {
  XpertProjectConversationDialogComponent,
  type XpertProjectConversationDialogData
} from './project-conversation-dialog.component'

type ConversationFilter = 'all' | 'busy' | 'idle' | 'interrupted' | 'error'

@Component({
  standalone: true,
  selector: 'xp-project-tasks',
  imports: [
    CommonModule,
    RouterLink,
    TranslateModule,
    ZardButtonComponent,
    ZardInputDirective,
    ZardToggleGroupComponent,
    ZardToggleGroupItemComponent
  ],
  template: `
    <section class="mx-auto flex w-full max-w-screen-xl flex-col gap-4 p-4 sm:p-6">
      <header
        class="flex flex-col gap-3 border-b border-divider-subtle pb-4 sm:flex-row sm:items-end sm:justify-between"
      >
        <div class="min-w-0">
          <p class="text-xs font-medium uppercase tracking-wide text-text-tertiary">
            {{ 'XP.XProject.AICollaboration' | translate }}
          </p>
          <h2 class="mt-1 text-xl font-semibold text-text-primary">{{ 'XP.XProject.Conversations' | translate }}</h2>
          <p class="mt-1 max-w-2xl text-sm text-text-secondary">
            {{ 'XP.XProject.ConversationsDescription' | translate }}
          </p>
        </div>
        <a
          z-button
          zType="default"
          zSize="sm"
          class="shrink-0"
          [routerLink]="['/project', projectId]"
          [queryParams]="{ chat: 'open' }"
        >
          <i class="ri-add-line mr-1"></i>{{ 'XP.XProject.StartConversation' | translate }}
        </a>
      </header>

      <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <input
          z-input
          class="w-full sm:max-w-sm"
          [placeholder]="'XP.XProject.FilterConversations' | translate"
          [value]="search()"
          (input)="search.set($any($event.target).value)"
        />
        <z-toggle-group
          zType="outline"
          zSize="sm"
          class="shrink-0"
          [value]="status()"
          [attr.aria-label]="'XP.XProject.ConversationFilter' | translate"
          (valueChange)="setStatus($event)"
        >
          @for (filter of filters; track filter) {
            <z-toggle-group-item [value]="filter" [attr.aria-label]="conversationStatusLabel(filter) | translate">
              {{ conversationStatusLabel(filter) | translate }}
            </z-toggle-group-item>
          }
        </z-toggle-group>
      </div>

      <section class="overflow-hidden rounded-lg border border-divider-regular bg-components-card-bg shadow-none">
        @if (facade.conversationsLoading()) {
          <div class="flex min-h-52 items-center justify-center gap-2 text-sm text-text-tertiary">
            <i class="ri-loader-4-line animate-spin"></i>{{ 'XP.XProject.LoadingConversations' | translate }}
          </div>
        } @else if (facade.conversationsError(); as error) {
          <div class="flex min-h-52 flex-col items-center justify-center gap-2 px-5 text-center">
            <i class="ri-error-warning-line text-2xl text-text-destructive"></i>
            <p class="text-sm text-text-destructive">{{ error }}</p>
            <button z-button zType="outline" zSize="sm" type="button" (click)="reload()">
              {{ 'XP.XProject.RetryLoadingConversations' | translate }}
            </button>
          </div>
        } @else {
          <div class="divide-y divide-divider-subtle">
            @for (conversation of visibleConversations(); track conversation.id) {
              <button
                type="button"
                class="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-background-default-subtle sm:px-5"
                (click)="openConversation(conversation)"
              >
                <span
                  class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/15"
                >
                  <i class="ri-chat-3-line"></i>
                </span>
                <span class="min-w-0 flex-1">
                  <span class="flex min-w-0 items-center gap-2">
                    <span class="truncate text-sm font-medium text-text-primary">
                      {{ conversation.title || ('XP.XProject.UntitledConversation' | translate) }}
                    </span>
                    <span class="flex shrink-0 items-center gap-1 text-xs text-text-tertiary">
                      <span [class]="conversationStatusDot(conversation.status)"></span>
                      <span class="hidden sm:inline">{{
                        conversationStatusLabel(conversation.status) | translate
                      }}</span>
                    </span>
                  </span>
                  <span class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-tertiary">
                    <span>{{
                      conversation.updatedAt
                        ? (conversation.updatedAt | date: 'medium')
                        : ('XP.XProject.NoActivityDate' | translate)
                    }}</span>
                    @if (conversation.threadId) {
                      <span class="font-mono"
                        >{{ 'XP.XProject.Thread' | translate }}: {{ shortId(conversation.threadId) }}</span
                      >
                    }
                    @if (conversation.executions?.length) {
                      <span class="font-mono"
                        >{{ 'XP.XProject.ExecutionId' | translate }}:
                        {{ shortId(conversation.executions?.[0]?.id) }}</span
                      >
                    }
                  </span>
                </span>
                <i
                  class="ri-arrow-right-s-line shrink-0 text-lg text-text-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-text-primary"
                ></i>
              </button>
            } @empty {
              <div class="flex min-h-52 flex-col items-center justify-center px-5 text-center">
                <i class="ri-chat-3-line text-3xl text-text-tertiary"></i>
                <p class="mt-3 text-sm text-text-tertiary">{{ 'XP.XProject.NoProjectConversations' | translate }}</p>
                <a
                  z-button
                  zType="outline"
                  zSize="sm"
                  class="mt-3"
                  [routerLink]="['/project', projectId]"
                  [queryParams]="{ chat: 'open' }"
                >
                  {{ 'XP.XProject.StartConversation' | translate }}
                </a>
              </div>
            }
          </div>
        }
      </section>
    </section>
  `,
  host: { class: 'block w-full min-w-0' }
})
export class XpertProjectTasksComponent implements OnInit {
  readonly facade = inject(XpertProjectFacade)
  readonly #dialog = inject(ZardDialogService)
  readonly #route = inject(ActivatedRoute)
  readonly projectId = this.#route.parent?.snapshot.paramMap.get('id') ?? ''
  readonly search = signal('')
  readonly status = signal<ConversationFilter>('all')
  readonly filters: ConversationFilter[] = ['all', 'busy', 'idle', 'interrupted', 'error']
  readonly visibleConversations = computed(() => {
    const query = this.search().trim().toLowerCase()
    const filter = this.status()
    return this.facade.conversations().filter((conversation) => {
      const text = `${conversation.title ?? ''} ${conversation.threadId ?? ''} ${conversation.from ?? ''}`.toLowerCase()
      return (!query || text.includes(query)) && (filter === 'all' || (conversation.status ?? 'idle') === filter)
    })
  })

  ngOnInit() {
    void this.reload()
  }

  reload() {
    return this.facade.loadConversations(this.projectId)
  }

  setStatus(value: unknown) {
    if (typeof value === 'string' && this.filters.includes(value as ConversationFilter)) {
      this.status.set(value as ConversationFilter)
    }
  }

  conversationStatusLabel(status?: string): string {
    const normalized = status && this.filters.includes(status as ConversationFilter) ? status : 'idle'
    return `XP.XProject.ConversationStatus.${normalized}`
  }

  conversationStatusDot(status?: string) {
    switch (status) {
      case 'busy':
        return 'size-1.5 rounded-full bg-primary animate-pulse'
      case 'error':
        return 'size-1.5 rounded-full bg-text-destructive'
      case 'interrupted':
        return 'size-1.5 rounded-full bg-text-warning'
      default:
        return 'size-1.5 rounded-full bg-text-success'
    }
  }

  shortId(value?: string | null) {
    const normalized = value?.trim()
    return normalized && normalized.length > 16
      ? `${normalized.slice(0, 8)}...${normalized.slice(-6)}`
      : normalized || '-'
  }

  openConversation(conversation: IChatConversation) {
    const threadId = conversation.threadId?.trim()
    if (!threadId) return

    const data: XpertProjectConversationDialogData = {
      projectId: this.projectId,
      project: this.facade.project(),
      conversation,
      executionId: conversation.executions?.[0]?.id
    }
    this.#dialog.open(XpertProjectConversationDialogComponent, {
      data,
      width: 'min(96vw, 980px)',
      maxWidth: 'calc(100vw - 24px)',
      backdropClass: 'backdrop-blur-sm-black',
      panelClass: 'xp-overlay-pane-card'
    })
  }
}
