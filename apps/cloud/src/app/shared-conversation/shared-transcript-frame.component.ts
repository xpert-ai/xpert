import { DOCUMENT } from '@angular/common'
import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild
} from '@angular/core'
import { DomSanitizer } from '@angular/platform-browser'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ConversationShareSnapshot } from '@xpert-ai/contracts'
import { environment } from '@cloud/environments/environment'
import { AppService } from '../app.service'
import { injectAssistantChatkitTheme } from '../features/assistant/assistant-chatkit-theme'
import { normalizeAssistantFrameUrl } from '../features/assistant/assistant-chatkit-frame-url'

/** Only the already-authorized projection crosses this frame boundary, never login/share credentials. */
@Component({
  standalone: true,
  selector: 'xp-shared-transcript-frame',
  imports: [TranslateModule],
  template: `
    @if (failed()) {
      <p role="alert">{{ 'ConversationShare.RendererUnavailable' | translate }}</p>
    } @else {
      <iframe
        #frame
        [src]="frameUrl"
        [style.height.px]="height()"
        class="block w-full border-0"
        [title]="'ConversationShare.ReadOnly' | translate"
        sandbox="allow-scripts allow-same-origin allow-popups"
        referrerpolicy="no-referrer"
        (load)="onLoad()"
      ></iframe>
    }
  `
})
export class SharedTranscriptFrameComponent implements OnDestroy {
  readonly snapshot = input.required<ConversationShareSnapshot & { expiresAt?: string }>()
  private readonly document = inject(DOCUMENT)
  private readonly app = inject(AppService)
  private readonly translate = inject(TranslateService)
  private readonly sanitizer = inject(DomSanitizer)
  private readonly frame = viewChild<ElementRef<HTMLIFrameElement>>('frame')
  private readonly channelId = crypto.randomUUID()
  private readonly target = new URL(
    normalizeAssistantFrameUrl(environment.CHATKIT_FRAME_URL || '/chatkit'),
    this.document.baseURI
  )
  private readonly ready = signal(false)
  private readonly theme = injectAssistantChatkitTheme(
    this.document,
    computed(() => (this.app.theme$().primary === 'dark' ? 'dark' : 'light'))
  )
  readonly height = signal(500)
  readonly failed = signal(false)
  readonly frameUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.buildUrl())
  private timer?: ReturnType<typeof setTimeout>
  private readonly language = this.translate.onLangChange.subscribe(() => this.publish())

  constructor() {
    effect(() => {
      this.snapshot()
      this.theme()
      if (this.ready()) this.publish()
    })
  }

  private buildUrl() {
    if (!['http:', 'https:'].includes(this.target.protocol)) throw new Error('Invalid ChatKit frame URL')
    this.target.searchParams.set('view', 'shared-conversation')
    this.target.hash = new URLSearchParams({
      channelId: this.channelId,
      parentOrigin: this.document.location.origin
    }).toString()
    return this.target.toString()
  }

  onLoad() {
    clearTimeout(this.timer)
    if (!this.ready()) this.timer = setTimeout(() => this.failed.set(true), 15000)
  }

  @HostListener('window:message', ['$event'])
  receive(event: MessageEvent<unknown>) {
    if (event.source !== this.frame()?.nativeElement.contentWindow || event.origin !== this.target.origin) return
    const message = event.data
    if (
      !message ||
      typeof message !== 'object' ||
      !('channelId' in message) ||
      message.channelId !== this.channelId ||
      !('type' in message)
    )
      return
    if (message.type === 'chatkit:shared-transcript-ready') {
      clearTimeout(this.timer)
      this.ready.set(true)
      this.publish()
    } else if (
      message.type === 'chatkit:shared-transcript-size' &&
      'height' in message &&
      typeof message.height === 'number' &&
      Number.isFinite(message.height)
    ) {
      this.height.set(Math.max(100, Math.min(100000, message.height)))
    }
  }

  private publish() {
    if (!this.ready()) return
    const snapshot = this.snapshot()
    this.frame()?.nativeElement.contentWindow?.postMessage(
      {
        type: 'chatkit:shared-transcript',
        channelId: this.channelId,
        snapshot: {
          messages: snapshot.messages,
          expiresAt: snapshot.expiresAt ?? new Date(Date.now() + 70000).toISOString()
        },
        theme: this.theme(),
        locale: this.translate.currentLang || 'en-US'
      },
      this.target.origin
    )
  }

  ngOnDestroy() {
    clearTimeout(this.timer)
    this.language.unsubscribe()
  }
}
