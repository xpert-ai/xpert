import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser'

import type { WorkbenchOpenFile } from './workbench-file-open-client-command'

type PreviewKind = 'pdf' | 'image' | 'text' | 'unknown'

@Component({
  standalone: true,
  selector: 'xp-workbench-file-preview-dialog',
  template: `
    <section
      class="flex max-h-[90vh] w-[min(1120px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-divider-regular bg-components-card-bg text-text-primary shadow-2xl"
    >
      <header class="flex items-start justify-between gap-4 border-b border-divider-regular px-5 py-4">
        <div class="flex min-w-0 items-start gap-3">
          <div
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background-default-subtle text-text-secondary"
          >
            @if (kind() === 'image') {
              <i class="ri-image-line text-lg"></i>
            } @else {
              <i class="ri-file-text-line text-lg"></i>
            }
          </div>
          <div class="min-w-0">
            <h2 class="truncate text-base font-semibold leading-6">{{ file.name || 'Source document' }}</h2>
            @if (file.mimeType) {
              <p class="mt-1 truncate text-xs text-text-tertiary">{{ file.mimeType }}</p>
            }
          </div>
        </div>

        <div class="flex shrink-0 items-center gap-2">
          <button
            type="button"
            class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-divider-regular text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-primary"
            aria-label="Open file"
            (click)="openExternal()"
          >
            <i class="ri-external-link-line"></i>
          </button>
          <a
            class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-divider-regular text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-primary"
            [href]="previewUrl()"
            [download]="file.name || 'source-document'"
            aria-label="Download file"
          >
            <i class="ri-download-line"></i>
          </a>
          <button
            type="button"
            class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-primary"
            aria-label="Close"
            (click)="close()"
          >
            <i class="ri-close-line"></i>
          </button>
        </div>
      </header>

      <div class="min-h-0 flex-1 bg-background-default-subtle">
        @switch (kind()) {
          @case ('pdf') {
            <iframe
              class="block h-[72vh] min-h-[520px] w-full border-0 bg-components-card-bg"
              [src]="safePreviewUrl()"
              [title]="file.name || 'Source document'"
            ></iframe>
          }
          @case ('image') {
            <div class="flex h-[72vh] min-h-[520px] items-center justify-center overflow-auto p-4">
              <img
                class="max-h-full max-w-full object-contain"
                [src]="previewUrl()"
                [alt]="file.name || 'Source document'"
              />
            </div>
          }
          @case ('text') {
            <div class="h-[72vh] min-h-[520px] overflow-auto bg-components-card-bg">
              @if (textLoading()) {
                <div class="flex h-full items-center justify-center gap-2 text-sm text-text-secondary">
                  <i class="ri-loader-4-line animate-spin"></i>
                  <span>Loading preview...</span>
                </div>
              } @else if (textError()) {
                <div class="flex h-full items-center justify-center gap-2 px-4 text-sm text-text-destructive">
                  <i class="ri-error-warning-line"></i>
                  <span>{{ textError() }}</span>
                </div>
              } @else {
                <pre class="min-h-full whitespace-pre-wrap p-4 text-xs leading-5 text-text-primary">{{
                  textContent()
                }}</pre>
              }
            </div>
          }
          @default {
            <div
              class="flex h-[60vh] min-h-[360px] flex-col items-center justify-center gap-3 px-6 text-center text-sm text-text-secondary"
            >
              <i class="ri-file-text-line text-4xl"></i>
              <div>This file type cannot be previewed inline.</div>
              <button
                type="button"
                class="inline-flex items-center gap-2 rounded-lg border border-divider-regular px-3 py-2 text-text-primary transition-colors hover:bg-hover-bg"
                (click)="openExternal()"
              >
                <i class="ri-external-link-line"></i>
                <span>Open file</span>
              </button>
            </div>
          }
        }
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkbenchFilePreviewDialogComponent {
  readonly file = inject<WorkbenchOpenFile>(DIALOG_DATA)
  readonly #dialogRef = inject(DialogRef)
  readonly #sanitizer = inject(DomSanitizer)

  readonly textLoading = signal(false)
  readonly textContent = signal<string | null>(null)
  readonly textError = signal<string | null>(null)

  readonly previewUrl = computed(() => this.file.previewUrl || this.file.url)
  readonly kind = computed(() => resolvePreviewKind(this.file))
  readonly safePreviewUrl = computed<SafeResourceUrl>(() =>
    this.#sanitizer.bypassSecurityTrustResourceUrl(this.previewUrl())
  )

  constructor() {
    if (this.kind() === 'text') {
      void this.loadTextPreview()
    }
  }

  close() {
    this.#dialogRef.close()
  }

  openExternal() {
    window.open(this.previewUrl(), '_blank', 'noopener,noreferrer')
  }

  async loadTextPreview() {
    this.textLoading.set(true)
    this.textContent.set(null)
    this.textError.set(null)

    try {
      const response = await fetch(this.previewUrl())
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      this.textContent.set(await response.text())
    } catch (error) {
      this.textError.set(error instanceof Error ? error.message : String(error))
    } finally {
      this.textLoading.set(false)
    }
  }
}

export function openWorkbenchFilePreviewDialog(dialog: Dialog, file: WorkbenchOpenFile) {
  return dialog.open(WorkbenchFilePreviewDialogComponent, {
    data: file,
    width: 'min(1120px, calc(100vw - 32px))',
    maxWidth: 'calc(100vw - 32px)',
    maxHeight: '90vh',
    backdropClass: 'backdrop-blur-sm-black'
  })
}

function resolvePreviewKind(file: WorkbenchOpenFile): PreviewKind {
  const mimeType = file.mimeType?.toLowerCase()
  const extension = getFileExtension(file.name)
  if (mimeType === 'application/pdf' || extension === 'pdf') {
    return 'pdf'
  }
  if (mimeType?.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(extension)) {
    return 'image'
  }
  if (mimeType?.startsWith('text/') || ['txt', 'md', 'csv', 'json', 'xml', 'log', 'yaml', 'yml'].includes(extension)) {
    return 'text'
  }
  return 'unknown'
}

function getFileExtension(name: string): string {
  const match = /\.([^.?#/]+)(?:[?#].*)?$/.exec(name)
  return match ? match[1].toLowerCase() : ''
}
