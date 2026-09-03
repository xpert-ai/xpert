import { Dialog, DialogModule, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { TranslateModule } from '@ngx-translate/core'
import { NavigationEnd, Router } from '@angular/router'
import { filter, firstValueFrom } from 'rxjs'
import { ChatConversationService, IChatConversation, getErrorMessage } from '../../@core'
import { CloudSidebarConversationComponent } from './cloud-sidebar-conversation.component'

type ArchiveData = { xpertId: string; routeBase: string[] }

@Component({
  standalone: true,
  selector: 'xp-sidebar-conversation-archive',
  imports: [DialogModule, TranslateModule],
  template: `
    <button
      type="button"
      class="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      (click)="$event.stopPropagation(); open()"
    >
      <i class="ri-archive-line" aria-hidden="true"></i>{{ 'XP.Sidebar.ArchivedConversations' | translate }}
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SidebarConversationArchiveButtonComponent {
  readonly xpertId = input.required<string>()
  readonly routeBase = input.required<string[]>()
  readonly #dialog = inject(Dialog)

  open() {
    this.#dialog.open(SidebarConversationArchiveComponent, {
      data: { xpertId: this.xpertId(), routeBase: this.routeBase() } satisfies ArchiveData,
      backdropClass: 'backdrop-blur-xs-black',
      panelClass: 'xp-overlay-pane-dialog'
    })
  }
}

@Component({
  standalone: true,
  imports: [TranslateModule, CloudSidebarConversationComponent],
  template: `
    <section class="flex max-h-[80vh] w-[min(40rem,92vw)] flex-col p-4">
      <header class="mb-3 flex items-center justify-between gap-4">
        <h2 class="font-semibold text-text-primary">{{ 'XP.Sidebar.ArchivedConversations' | translate }}</h2>
        <button
          type="button"
          class="flex size-8 items-center justify-center rounded text-text-secondary hover:bg-hover-bg"
          (click)="dialog.close()"
          [attr.aria-label]="'XP.Sidebar.CloseConversationFolder' | translate"
        >
          <i class="ri-close-line text-xl" aria-hidden="true"></i>
        </button>
      </header>
      <div class="min-h-0 overflow-y-auto">
        @for (conversation of items(); track conversation.id) {
          <xp-sidebar-conversation [conversation]="conversation" [route]="route(conversation)" />
        } @empty {
          <p class="p-3 text-sm text-text-tertiary">
            {{
              (loading() ? 'XP.Sidebar.LoadingRecentConversations' : 'XP.Sidebar.NoArchivedConversations') | translate
            }}
          </p>
        }
        @if (items().length < total()) {
          <button
            type="button"
            class="w-full py-2 text-sm text-text-secondary hover:text-text-primary"
            [disabled]="loading()"
            (click)="load(true)"
          >
            {{ 'XP.Sidebar.LoadEarlierConversations' | translate }}
          </button>
        }
        @if (error()) {
          <p role="alert" class="p-2 text-sm text-text-destructive">{{ error() }}</p>
        }
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SidebarConversationArchiveComponent {
  readonly data = inject<ArchiveData>(DIALOG_DATA)
  readonly dialog = inject(DialogRef)
  readonly #api = inject(ChatConversationService)
  readonly items = signal<IChatConversation[]>([])
  readonly total = signal(0)
  readonly loading = signal(false)
  readonly error = signal('')
  #request = 0

  constructor() {
    void this.load()
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed()
      )
      .subscribe(() => this.dialog.close())
    this.#api.sidebarRefresh$.pipe(takeUntilDestroyed()).subscribe(({ xpertId }) => {
      if (xpertId === this.data.xpertId) void this.load()
    })
  }

  route(conversation: IChatConversation) {
    return [...this.data.routeBase, conversation.threadId]
  }

  async load(append = false) {
    const request = ++this.#request
    this.loading.set(true)
    this.error.set('')
    try {
      const result = await firstValueFrom(
        this.#api.getSidebarConversations(this.data.xpertId, 30, append ? this.items().length : 0, true)
      )
      if (request !== this.#request) return
      this.items.update((items) => (append ? [...items, ...result.items] : result.items))
      this.total.set(result.total)
    } catch (error) {
      if (request === this.#request) this.error.set(getErrorMessage(error))
    } finally {
      if (request === this.#request) this.loading.set(false)
    }
  }
}
