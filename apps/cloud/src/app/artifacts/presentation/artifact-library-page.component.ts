import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { Component, DestroyRef, inject, signal } from '@angular/core'
import { ActivatedRoute, RouterLink } from '@angular/router'
import { HttpErrorResponse } from '@angular/common/http'
import { DomSanitizer, Meta, SafeResourceUrl, SafeHtml } from '@angular/platform-browser'
import { TranslateModule } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import type { ArtifactLibraryView } from '@xpert-ai/contracts'
import { ArtifactPresentationService } from '../../@core/services/artifact-presentation.service'
import { SharedTranscriptFrameComponent } from '../../shared-conversation/shared-transcript-frame.component'
import { ArtifactPresentationComponent } from './artifact-presentation.component'
import { isolatePresentationHtml } from './presentation-bridge'

@Component({
  standalone: true,
  host: { class: 'block h-dvh w-full min-w-0 overflow-auto' },
  imports: [TranslateModule, RouterLink, SharedTranscriptFrameComponent, ArtifactPresentationComponent],
  template: `<main class="min-h-dvh w-full bg-components-card-bg text-text-primary p-6">
    @if (error()) {
      <div class="mx-auto max-w-3xl py-16" role="alert">{{ 'ArtifactLibrary.Unavailable' | translate }}</div>
    } @else if (login()) {
      <a routerLink="/auth/login" [queryParams]="{ returnUrl: returnUrl }" class="underline">{{
        'ConversationShare.Login' | translate
      }}</a>
    } @else if (view(); as current) {
      <header class="mx-auto mb-6 max-w-3xl">
        <p class="text-text-secondary">{{ 'ArtifactLibrary.ReadOnly' | translate }}</p>
        <h1 class="mt-2 text-2xl font-semibold break-words">{{ current.title }}</h1>
      </header>
      @switch (current.content.kind) {
        @case ('conversation') {
          <xp-shared-transcript-frame class="mx-auto block max-w-3xl" [snapshot]="current.content.snapshot" />
        }
        @case ('presentation') {
          <div class="h-[calc(100dvh-10rem)]"><xp-artifact-presentation [slug]="id" [library]="true" /></div>
        }
        @case ('file') {
          <section class="mx-auto max-w-5xl">
            @if (html()) {
              <iframe
                class="h-[70dvh] w-full border-0"
                sandbox="allow-scripts"
                [srcdoc]="html()"
                [title]="current.title"
              ></iframe>
            } @else if (text() !== null) {
              <pre class="whitespace-pre-wrap break-words">{{ text() }}</pre>
            } @else if (previewUrl()) {
              <iframe
                class="h-[70dvh] w-full border-0"
                sandbox=""
                [src]="previewUrl()"
                [title]="current.title"
              ></iframe>
            }
            @if (downloadUrl() && current.content.canDownload) {
              <a class="my-4 inline-block underline" [href]="downloadUrl()" [download]="current.content.fileName">{{
                'ArtifactLibrary.Download' | translate
              }}</a>
            }
          </section>
        }
      }
    } @else {
      <p role="status">{{ 'ConversationShare.Loading' | translate }}</p>
    }
  </main>`
})
export class ArtifactLibraryPageComponent {
  private readonly api = inject(ArtifactPresentationService)
  private readonly sanitizer = inject(DomSanitizer)
  private readonly route = inject(ActivatedRoute)
  id = ''
  get returnUrl() {
    return `/artifacts/library/${encodeURIComponent(this.id)}`
  }
  private generation = 0
  readonly view = signal<ArtifactLibraryView | null>(null)
  readonly error = signal(false)
  readonly login = signal(false)
  readonly text = signal<string | null>(null)
  readonly html = signal<SafeHtml | null>(null)
  readonly previewUrl = signal<SafeResourceUrl | null>(null)
  readonly downloadUrl = signal('')
  private timer?: ReturnType<typeof setTimeout>
  private dead = false
  constructor() {
    const meta = inject(Meta),
      previous = meta.getTag('name="robots"')?.content
    meta.updateTag({ name: 'robots', content: 'noindex, nofollow, noarchive' })
    inject(DestroyRef).onDestroy(() => {
      this.dead = true
      clearTimeout(this.timer)
      this.clearFile()
      if (previous) meta.updateTag({ name: 'robots', content: previous })
      else meta.removeTag('name="robots"')
    })
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.id = params.get('id') ?? ''
      clearTimeout(this.timer)
      this.clearFile()
      this.view.set(null)
      this.error.set(false)
      this.login.set(false)
      void this.load(++this.generation)
    })
  }
  private clearFile() {
    if (this.downloadUrl()) URL.revokeObjectURL(this.downloadUrl())
    this.downloadUrl.set('')
    this.previewUrl.set(null)
    this.html.set(null)
    this.text.set(null)
  }
  private async load(generation: number) {
    try {
      const view = await firstValueFrom(this.api.readLibrary(this.id))
      if (this.dead || generation !== this.generation) return
      if (this.view()?.revision !== view.revision) {
        this.clearFile()
        this.view.set(null)
        if (view.content.kind === 'file') {
          const file = await firstValueFrom(this.api.readLibraryFile(this.id, view.revision))
          if (this.dead || generation !== this.generation) return
          const isText = view.content.mimeType.startsWith('text/') || view.content.mimeType === 'application/json'
          const text = isText ? await file.text() : null
          if (this.dead || generation !== this.generation) return
          if (view.content.mimeType === 'text/html')
            this.html.set(this.sanitizer.bypassSecurityTrustHtml(isolatePresentationHtml(text ?? '')))
          else if (text !== null) this.text.set(text)
          const url = URL.createObjectURL(file)
          this.downloadUrl.set(url)
          if (['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(view.content.mimeType))
            this.previewUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(url))
        }
      }
      this.view.set(view)
      this.timer = setTimeout(() => void this.load(generation), 60_000)
    } catch (error) {
      if (this.dead || generation !== this.generation) return
      this.view.set(null)
      this.clearFile()
      if (error instanceof HttpErrorResponse && error.status === 401) this.login.set(true)
      else this.error.set(true)
    }
  }
}
