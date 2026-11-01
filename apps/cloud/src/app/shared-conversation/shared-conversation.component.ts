import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core'
import { HttpErrorResponse } from '@angular/common/http'
import { ActivatedRoute, RouterLink } from '@angular/router'
import { Meta } from '@angular/platform-browser'
import { TranslateModule } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import type { SharedConversation } from '@xpert-ai/contracts'
import { Store } from '../@core/state'
import { ConversationSharingService } from '../@core/services/conversation-sharing.service'
import { SharedTranscriptFrameComponent } from './shared-transcript-frame.component'

@Component({
  standalone: true,
  selector: 'xp-shared-conversation',
  host: { class: 'block h-dvh w-full min-w-0 overflow-y-auto' },
  imports: [TranslateModule, RouterLink, SharedTranscriptFrameComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="w-full min-h-dvh bg-components-card-bg text-text-primary px-4 py-10">
      <section class="mx-auto max-w-3xl">
        @if (snapshot(); as chat) {
          <p class="text-sm text-text-secondary">
            {{ 'ConversationShare.ReadOnly' | translate: { Default: 'Shared conversation · Read only' } }}
          </p>
          <h1 class="mt-2 text-2xl font-semibold break-words">{{ chat.title }}</h1>
          <p class="mt-3 text-sm text-text-secondary">
            {{
              'ConversationShare.SnapshotNotice'
                | translate: { Default: 'This is a text snapshot. Later messages and attachments are not included.' }
            }}
          </p>
          <xp-shared-transcript-frame class="mt-8 block" [snapshot]="chat" />
        } @else if (signIn()) {
          <h1 class="text-xl font-semibold">
            {{ 'ConversationShare.SignIn' | translate: { Default: 'Sign in to view this conversation' } }}
          </h1>
          <p class="my-4 text-text-secondary">
            {{
              'ConversationShare.MembersOnly'
                | translate: { Default: 'Only active members of the originating organization can view this link.' }
            }}
          </p>
          <a routerLink="/auth/login" [queryParams]="{ returnUrl: returnUrl }" class="underline">{{
            'ConversationShare.Login' | translate: { Default: 'Sign in' }
          }}</a>
        } @else if (failed()) {
          <h1 class="text-xl font-semibold">
            {{ 'ConversationShare.Unavailable' | translate: { Default: 'This shared conversation is unavailable' } }}
          </h1>
          <p class="mt-3 text-text-secondary">
            {{
              'ConversationShare.UnavailableHint'
                | translate: { Default: 'The link may have expired, been revoked, or you may not have access.' }
            }}
          </p>
        } @else {
          <p role="status">
            {{ 'ConversationShare.Loading' | translate: { Default: 'Loading shared conversation…' } }}
          </p>
        }
      </section>
    </main>
  `
})
export class SharedConversationComponent implements OnInit, OnDestroy {
  private readonly shares = inject(ConversationSharingService)
  private readonly route = inject(ActivatedRoute)
  private readonly store = inject(Store)
  private readonly meta = inject(Meta)
  private destroyed = false
  private expiryTimer?: ReturnType<typeof setTimeout>
  private refreshTimer?: ReturnType<typeof setTimeout>
  readonly snapshot = signal<SharedConversation | null>(null)
  readonly signIn = signal(false)
  readonly failed = signal(false)
  readonly token = this.route.snapshot.paramMap.get('token') ?? ''
  readonly returnUrl = `/s/${encodeURIComponent(this.token)}`
  private previousRobots = this.meta.getTag('name="robots"')?.content
  private previousReferrer = this.meta.getTag('name="referrer"')?.content

  ngOnInit() {
    this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow, noarchive' })
    this.meta.updateTag({ name: 'referrer', content: 'no-referrer' })
    void this.load()
  }

  ngOnDestroy() {
    this.destroyed = true
    clearTimeout(this.expiryTimer)
    clearTimeout(this.refreshTimer)
    for (const [name, content] of [
      ['robots', this.previousRobots],
      ['referrer', this.previousReferrer]
    ]) {
      if (content) this.meta.updateTag({ name, content })
      else this.meta.removeTag(`name="${name}"`)
    }
  }

  private async load() {
    if (!/^[A-Za-z0-9]{12}$/.test(this.token)) {
      this.failed.set(true)
      return
    }
    try {
      let chat: SharedConversation
      try {
        chat = await firstValueFrom(this.shares.read(this.token))
      } catch (error) {
        if (!(error instanceof HttpErrorResponse) || error.status !== 401) throw error
        if (!this.store.token) {
          this.snapshot.set(null)
          this.signIn.set(true)
          return
        }
        chat = await firstValueFrom(this.shares.read(this.token, true))
      }
      if (this.destroyed) return
      this.snapshot.set(chat)
      clearTimeout(this.expiryTimer)
      // Clear already-rendered content on expiry and periodically recheck revocation/membership.
      this.expiryTimer = setTimeout(
        () => {
          this.snapshot.set(null)
          this.failed.set(true)
        },
        Math.min(Math.max(0, Date.parse(chat.expiresAt) - Date.now()), 2147483647)
      )
      this.refreshTimer = setTimeout(() => void this.load(), 60_000)
    } catch {
      if (!this.destroyed) {
        this.snapshot.set(null)
        this.failed.set(true)
      }
    }
  }
}
