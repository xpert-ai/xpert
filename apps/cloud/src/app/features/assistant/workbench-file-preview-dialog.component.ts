import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core'
import { FilePreviewContentComponent } from '../../@shared/files/preview/file-preview-content.component'
import { createFilePreviewState, toFilePreviewSource } from '../../@shared/files/preview/file-preview.utils'

import type { WorkbenchOpenFile } from './workbench-file-open-client-command'

@Component({
  standalone: true,
  selector: 'xp-workbench-file-preview-dialog',
  imports: [FilePreviewContentComponent],
  template: `
    <section
      class="flex max-h-[90vh] w-[min(1120px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-divider-regular bg-components-card-bg text-text-primary shadow-2xl"
    >
      <header class="flex items-start justify-between gap-4 border-b border-divider-regular px-5 py-4">
        <div class="flex min-w-0 items-start gap-3">
          <div
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background-default-subtle text-text-secondary"
          >
            @if (previewKind() === 'image') {
              <i class="ri-image-line text-lg"></i>
            } @else if (previewKind() === 'spreadsheet') {
              <i class="ri-table-line text-lg"></i>
            } @else if (previewKind() === 'document') {
              <i class="ri-file-word-line text-lg"></i>
            } @else if (previewKind() === 'pdf') {
              <i class="ri-file-pdf-2-line text-lg"></i>
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

      <pac-file-preview-content
        class="flex flex-col h-[72vh] min-h-0 flex-1 overflow-hidden bg-components-card-bg"
        [content]="previewContent()"
        [documentBlob]="previewData().documentBlob"
        [downloadable]="true"
        [error]="previewError()"
        [fileName]="file.name || 'Source document'"
        [loading]="previewLoading()"
        [previewKind]="previewKind()"
        [spreadsheet]="spreadsheet()"
        [url]="previewUrl()"
        (download)="downloadFile()"
      />
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkbenchFilePreviewDialogComponent {
  readonly file = inject<WorkbenchOpenFile>(DIALOG_DATA)
  readonly #dialogRef = inject(DialogRef)

  readonly previewUrl = computed(() => this.file.previewUrl || this.file.url)
  readonly previewSource = computed(() =>
    toFilePreviewSource({
      mimeType: this.file.mimeType,
      name: this.file.name,
      url: this.previewUrl()
    })
  )
  readonly previewState = createFilePreviewState(this.previewSource, loadTextPreview)
  readonly previewContent = this.previewState.content
  readonly previewData = this.previewState.previewData
  readonly previewError = this.previewState.previewError
  readonly previewKind = this.previewState.previewKind
  readonly previewLoading = this.previewState.previewLoading
  readonly spreadsheet = this.previewState.spreadsheet

  close() {
    this.#dialogRef.close()
  }

  openExternal() {
    window.open(this.previewUrl(), '_blank', 'noopener,noreferrer')
  }

  downloadFile() {
    if (typeof document === 'undefined') {
      this.openExternal()
      return
    }

    const anchor = document.createElement('a')
    anchor.href = this.previewUrl()
    anchor.download = this.file.name || 'source-document'
    anchor.rel = 'noopener noreferrer'
    anchor.click()
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

async function loadTextPreview(url: string) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  return response.text()
}
