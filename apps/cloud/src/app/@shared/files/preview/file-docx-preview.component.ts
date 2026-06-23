import { ChangeDetectionStrategy, Component, ElementRef, effect, input, signal, viewChild } from '@angular/core'
import { renderAsync } from 'docx-preview'

@Component({
  standalone: true,
  selector: 'pac-file-docx-preview',
  template: `
    <div class="relative min-h-full bg-components-panel-bg px-4 py-5">
      @if (rendering()) {
        <div
          class="absolute inset-0 z-10 flex items-center justify-center bg-components-panel-bg/60 text-text-secondary"
        >
          <i class="ri-loader-4-line mr-2 animate-spin"></i>
          <span>{{ loadingLabel() }}</span>
        </div>
      } @else if (error()) {
        <div class="flex h-full flex-col items-center justify-center gap-3 text-center text-text-tertiary">
          <i class="ri-file-warning-line text-3xl"></i>
          <div>{{ errorLabel() }}</div>
        </div>
      }

      <div
        #docxHost
        class="xp-docx-preview mx-auto max-w-full [&_.docx-wrapper]:!bg-transparent [&_.docx-wrapper]:!p-0 [&_section.docx]:mx-auto [&_section.docx]:max-w-full"
        [attr.aria-label]="fileName()"
      ></div>
    </div>
  `,
  host: {
    class: 'block min-h-full'
  },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FileDocxPreviewComponent {
  readonly documentBlob = input<Blob | null>(null)
  readonly fileName = input('')
  readonly loadingLabel = input('Rendering document...')
  readonly errorLabel = input('Failed to render document preview.')

  readonly rendering = signal(false)
  readonly error = signal<string | null>(null)

  private readonly docxHost = viewChild<ElementRef<HTMLElement>>('docxHost')

  readonly #renderEffect = effect((onCleanup) => {
    const blob = this.documentBlob()
    const host = this.docxHost()?.nativeElement
    if (!blob || !host) {
      this.rendering.set(false)
      this.error.set(null)
      return
    }

    let active = true
    this.rendering.set(true)
    this.error.set(null)
    host.replaceChildren()

    void renderAsync(blob, host, undefined, {
      breakPages: true,
      className: 'docx',
      experimental: true,
      ignoreFonts: false,
      ignoreHeight: false,
      ignoreLastRenderedPageBreak: true,
      ignoreWidth: false,
      inWrapper: true,
      renderChanges: false,
      renderComments: false,
      renderEndnotes: true,
      renderFooters: true,
      renderFootnotes: true,
      renderHeaders: true,
      useBase64URL: true
    })
      .then(() => {
        if (active) {
          this.rendering.set(false)
        }
      })
      .catch((error) => {
        if (!active) {
          return
        }

        this.error.set(error instanceof Error ? error.message : String(error))
        this.rendering.set(false)
      })

    onCleanup(() => {
      active = false
      host.replaceChildren()
    })
  })
}
