import { DOCUMENT } from '@angular/common'
import { Component, DestroyRef, ElementRef, effect, inject, input, signal, viewChild } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { DomSanitizer, SafeHtml } from '@angular/platform-browser'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { firstValueFrom, map, Subject, takeUntil } from 'rxjs'
import type { ArtifactPresentation } from '@xpert-ai/contracts'
import { XpThemeService } from '@xpert-ai/headless-ui'
import { ArtifactPresentationService } from '@cloud/app/@core/services/artifact-presentation.service'
import { createRemoteTheme } from '@cloud/app/@shared/view-extension/renderers/remote-component-theme'
import { isolatePresentationHtml, presentationMessage } from './presentation-bridge'

@Component({
  standalone: true,
  selector: 'xp-artifact-presentation',
  imports: [TranslateModule],
  host: { class: 'block h-full w-full min-h-0' },
  template: `
    @if (error()) {
      <section class="flex h-full flex-col items-center justify-center gap-4 p-6 text-center" role="alert">
        <h1 class="text-lg font-semibold">
          {{ 'ArtifactShareAuth.Unavailable' | translate: { Default: 'This shared artifact is unavailable' } }}
        </h1>
        <p class="max-w-lg text-sm text-text-secondary">
          {{
            'ArtifactPresentation.UnavailableHint'
              | translate: { Default: 'The published version or your access may have changed. Reopen to check again.' }
          }}
        </p>
        <button
          type="button"
          class="rounded-lg border border-border bg-components-card-bg px-4 py-2"
          (click)="reload()"
        >
          {{ 'ArtifactPresentation.Reopen' | translate: { Default: 'Reopen shared page' } }}
        </button>
      </section>
    } @else if (entry()) {
      <iframe
        #frame
        class="block h-full w-full border-0"
        sandbox="allow-scripts"
        [title]="title()"
        [srcdoc]="entry()"
      ></iframe>
    } @else {
      <div role="status" class="flex h-full items-center justify-center gap-3 text-text-secondary">
        <span class="size-5 animate-spin rounded-full border-2 border-current border-r-transparent"></span>
        {{ 'ArtifactShareAuth.Authorizing' | translate: { Default: 'Checking access…' } }}
      </div>
    }
  `
})
export class ArtifactPresentationComponent {
  readonly slug = input.required<string>()
  readonly frame = viewChild<ElementRef<HTMLIFrameElement>>('frame')
  readonly entry = signal<SafeHtml | null>(null)
  readonly error = signal(false)
  readonly title = signal('')
  private readonly api = inject(ArtifactPresentationService)
  private readonly sanitizer = inject(DomSanitizer)
  private readonly document = inject(DOCUMENT)
  private readonly translate = inject(TranslateService)
  private readonly theme = inject(XpThemeService)
  private readonly ready = signal(false)
  private readonly locale = toSignal(this.translate.onLangChange.pipe(map((event) => event.lang)), {
    initialValue: this.translate.currentLang || 'en-US'
  })
  private readonly cancelled = new Subject<void>()
  private presentation: ArtifactPresentation | null = null
  private sequence = 0
  private instanceId = ''
  private activeSlug = ''
  private inFlight = 0

  constructor() {
    effect(() => {
      const slug = this.slug()
      void this.load(slug)
    })
    effect(() => {
      if (this.ready()) this.initialize()
    })
    const listener = (event: MessageEvent<unknown>) => {
      void this.receive(event)
    }
    this.document.defaultView?.addEventListener('message', listener)
    inject(DestroyRef).onDestroy(() => {
      ++this.sequence
      this.cancelled.next()
      this.cancelled.complete()
      this.document.defaultView?.removeEventListener('message', listener)
    })
  }

  reload() {
    void this.load(this.slug())
  }

  private initialize() {
    this.frame()?.nativeElement.contentWindow?.postMessage(
      {
        channel: 'xpertai.remote_component',
        protocolVersion: 1,
        instanceId: this.instanceId,
        type: 'init',
        locale: this.locale(),
        theme: createRemoteTheme(this.document, this.theme.themeClass() === 'dark' ? 'dark' : 'light')
      },
      '*'
    )
  }

  private async load(slug: string) {
    this.cancelled.next()
    const sequence = ++this.sequence
    this.presentation = null
    this.entry.set(null)
    this.error.set(false)
    this.ready.set(false)
    this.activeSlug = slug
    this.instanceId = `artifact-${sequence}-${crypto.randomUUID()}`
    try {
      const presentation = await firstValueFrom(this.api.read(slug).pipe(takeUntil(this.cancelled)))
      if (sequence !== this.sequence) return
      this.presentation = presentation
      this.title.set(presentation.title)
      this.entry.set(this.sanitizer.bypassSecurityTrustHtml(isolatePresentationHtml(presentation.entry.html)))
    } catch {
      if (sequence === this.sequence) this.error.set(true)
    }
  }

  private async receive(event: MessageEvent<unknown>) {
    const frame = this.frame()?.nativeElement.contentWindow
    if (!frame || event.source !== frame || !this.presentation) return
    const parsed = presentationMessage.safeParse(event.data)
    if (!parsed.success) return
    const message = parsed.data,
      instanceId = this.instanceId,
      presentation = this.presentation
    const send = (body: object) => {
      if (instanceId === this.instanceId && frame === this.frame()?.nativeElement.contentWindow)
        frame.postMessage(
          {
            channel: 'xpertai.remote_component',
            protocolVersion: 1,
            instanceId,
            ...body
          },
          '*'
        )
    }
    if (message.type === 'ready') {
      if (this.ready()) this.initialize()
      else this.ready.set(true)
      return
    }
    if (message.instanceId !== instanceId) return
    if (message.type === 'requestData') {
      send({ type: 'data', requestId: message.requestId, data: presentation.data })
      return
    }
    if (!presentation.operations.includes(message.actionKey) || this.inFlight >= 16) {
      send({ type: 'error', requestId: message.requestId, message: 'ARTIFACT_READ_OPERATION_DENIED' })
      return
    }
    ++this.inFlight
    try {
      const data = await firstValueFrom(
        this.api
          .query(this.activeSlug, {
            target: presentation.target,
            operation: message.actionKey,
            input: message.input
          })
          .pipe(takeUntil(this.cancelled))
      )
      send({ type: 'actionResult', requestId: message.requestId, result: { success: true, data } })
    } catch {
      if (instanceId === this.instanceId) {
        this.error.set(true)
        this.entry.set(null)
      }
    } finally {
      --this.inFlight
    }
  }
}
