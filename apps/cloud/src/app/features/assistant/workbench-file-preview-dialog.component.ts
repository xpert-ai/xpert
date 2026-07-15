import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import type { WorkbenchOpenFile, WorkbenchOpenFileEvidenceBox } from '@xpert-ai/contracts'
import { FilePreviewContentComponent } from '../../@shared/files/preview/file-preview-content.component'
import {
  createFilePreviewState,
  resolveFilePreviewKind,
  toFilePreviewSource
} from '../../@shared/files/preview/file-preview.utils'

import { WorkbenchPdfEvidencePreviewComponent } from './workbench-pdf-evidence-preview.component'
import { normalizePdfEvidenceRotation } from './workbench-pdf-evidence-rotation'

export const WORKBENCH_FILE_PREVIEW_MAX_BYTES = 1024 * 1024

@Component({
  standalone: true,
  selector: 'xp-workbench-file-preview-dialog',
  imports: [TranslateModule, FilePreviewContentComponent, WorkbenchPdfEvidencePreviewComponent],
  host: {
    class: 'block h-full w-full'
  },
  template: `
    <section
      class="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-divider-regular bg-components-card-bg text-text-primary shadow-2xl"
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
            <h2 class="truncate text-base font-semibold leading-6">
              {{
                file.name || ('PAC.Assistant.FilePreview.SourceDocument' | translate: { Default: 'Source document' })
              }}
            </h2>
            @if (file.mimeType) {
              <p class="mt-1 truncate text-xs text-text-tertiary">{{ file.mimeType }}</p>
            }
          </div>
        </div>

        <div class="flex shrink-0 items-center gap-2">
          @if (!previewTooLarge()) {
            <button
              type="button"
              data-file-preview-open-external="true"
              class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-divider-regular text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-primary"
              [attr.aria-label]="'PAC.Assistant.FilePreview.OpenFile' | translate: { Default: 'Open file' }"
              (click)="openExternal()"
            >
              <i class="ri-external-link-line"></i>
            </button>
          }
          <a
            class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-divider-regular text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-primary"
            [href]="previewUrl()"
            [download]="file.name || 'source-document'"
            [attr.aria-label]="'PAC.Assistant.FilePreview.DownloadFile' | translate: { Default: 'Download file' }"
          >
            <i class="ri-download-line"></i>
          </a>
          <button
            type="button"
            class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-primary"
            [attr.aria-label]="'PAC.Assistant.FilePreview.Close' | translate: { Default: 'Close' }"
            (click)="close()"
          >
            <i class="ri-close-line"></i>
          </button>
        </div>
      </header>

      @if (previewTooLarge()) {
        <div
          data-file-preview-too-large="true"
          class="flex min-h-0 flex-1 items-center justify-center bg-components-card-bg px-6 py-10"
        >
          <div class="max-w-lg text-center">
            <div
              class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-background-default-subtle text-text-secondary"
            >
              <i class="ri-file-download-line text-xl"></i>
            </div>
            <h3 class="mt-4 text-base font-semibold text-text-primary">
              {{ 'PAC.Chat.FileTooLargeToPreview' | translate: { Default: 'This file is too large to preview.' } }}
            </h3>
            <p class="mt-2 text-sm leading-6 text-text-tertiary">
              {{
                'PAC.Chat.FileTooLargeDownloadHint'
                  | translate: { Default: 'Download it and open it locally to view its contents.' }
              }}
            </p>
            @if (fileSizeLabel() && previewSizeLimitLabel()) {
              <p class="mt-2 text-sm text-text-tertiary">
                {{
                  'PAC.Chat.FilePreviewSizeLimit'
                    | translate
                      : {
                          size: fileSizeLabel(),
                          limit: previewSizeLimitLabel(),
                          Default: 'File size: {{size
                }}. File preview limit: {{ limit }}.' } }}
              </p>
            }
            <button
              type="button"
              class="mt-5 inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-divider-regular px-4 text-sm font-medium text-text-primary transition-colors hover:bg-hover-bg"
              (click)="downloadFile()"
            >
              <i class="ri-download-line"></i>
              {{ 'PAC.Assistant.FilePreview.DownloadFile' | translate: { Default: 'Download file' } }}
            </button>
          </div>
        </div>
      } @else if (evidence(); as currentEvidence) {
        <div class="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_320px]">
          <div class="relative min-h-0 overflow-hidden">
            @if (controlledPdfEvidence()) {
              <xp-workbench-pdf-evidence-preview
                class="block h-full min-h-0"
                [box]="evidenceBox()"
                [fileName]="
                  file.name || ('PAC.Assistant.FilePreview.SourceDocument' | translate: { Default: 'Source document' })
                "
                [page]="evidencePage()"
                [rotation]="evidenceRotation()"
                [searchTerms]="evidenceSearchTerms()"
                [url]="basePreviewUrl()"
              />
            } @else {
              <pac-file-preview-content
                class="flex h-full min-h-0 flex-col overflow-hidden bg-components-card-bg"
                [content]="previewContent()"
                [documentBlob]="previewData().documentBlob"
                [downloadable]="true"
                [error]="previewError()"
                [fileName]="
                  file.name || ('PAC.Assistant.FilePreview.SourceDocument' | translate: { Default: 'Source document' })
                "
                [loading]="previewLoading()"
                [previewKind]="previewKind()"
                [spreadsheet]="spreadsheet()"
                [url]="previewUrl()"
                (download)="downloadFile()"
              />
            }
          </div>

          <aside
            class="space-y-3 overflow-auto border-t border-divider-regular bg-components-card-bg p-4 text-sm lg:border-l lg:border-t-0"
          >
            <div>
              <div class="text-xs font-medium uppercase tracking-wide text-text-tertiary">
                {{ 'PAC.Assistant.FilePreview.EvidenceLocation' | translate: { Default: 'Evidence location' } }}
              </div>
              <div class="mt-1 text-text-primary">
                @if (evidencePage()) {
                  P{{ evidencePage() }}
                } @else {
                  P—
                }
                @if (currentEvidence.method) {
                  · {{ currentEvidence.method }}
                }
              </div>
              @if (evidenceBox(); as box) {
                <div class="mt-1 font-mono text-xs text-text-tertiary">
                  x={{ box.x.toFixed(3) }}, y={{ box.y.toFixed(3) }}, w={{ box.width.toFixed(3) }}, h={{
                    box.height.toFixed(3)
                  }}
                </div>
              }
              @if (currentEvidence.locator?.recognitionRotation !== undefined) {
                <div class="mt-1 text-xs text-text-tertiary">
                  {{
                    'PAC.Assistant.FilePreview.RecognitionRotation' | translate: { Default: 'Recognition rotation' }
                  }}: {{ currentEvidence.locator?.recognitionRotation }}°
                </div>
              }
            </div>

            @if (currentEvidence.attributeCode || currentEvidence.displayValue) {
              <div class="rounded-xl border border-divider-regular bg-background-default-subtle p-3">
                @if (currentEvidence.attributeCode) {
                  <div class="font-medium text-text-primary">{{ currentEvidence.attributeCode }}</div>
                }
                @if (currentEvidence.displayValue) {
                  <div class="mt-1 text-text-secondary">{{ currentEvidence.displayValue }}</div>
                }
              </div>
            }

            @if (currentEvidence.text) {
              <div>
                <div class="text-xs font-medium uppercase tracking-wide text-text-tertiary">
                  {{ 'PAC.Assistant.FilePreview.EvidenceText' | translate: { Default: 'Evidence text' } }}
                </div>
                <p class="mt-1 whitespace-pre-wrap leading-6 text-text-primary">{{ currentEvidence.text }}</p>
              </div>
            }

            <p class="text-xs leading-5 text-text-tertiary">
              {{
                'PAC.Assistant.FilePreview.EvidenceHint'
                  | translate
                    : {
                        Default:
                          'The host preview overlays the evidence box using the rendered PDF page dimensions. An external browser tab can only open the original file and cannot render this evidence box.'
                      }
              }}
            </p>
          </aside>
        </div>
      } @else {
        <pac-file-preview-content
          class="flex min-h-0 flex-1 flex-col overflow-hidden bg-components-card-bg"
          [content]="previewContent()"
          [documentBlob]="previewData().documentBlob"
          [downloadable]="true"
          [error]="previewError()"
          [fileName]="
            file.name || ('PAC.Assistant.FilePreview.SourceDocument' | translate: { Default: 'Source document' })
          "
          [loading]="previewLoading()"
          [previewKind]="previewKind()"
          [spreadsheet]="spreadsheet()"
          [url]="previewUrl()"
          (download)="downloadFile()"
        />
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkbenchFilePreviewDialogComponent {
  readonly file = inject<WorkbenchOpenFile>(DIALOG_DATA)
  readonly #dialogRef = inject(DialogRef)
  readonly filePreviewSizeLimit = WORKBENCH_FILE_PREVIEW_MAX_BYTES

  readonly evidence = computed(() => this.file.evidence ?? null)
  readonly evidencePage = computed(() => this.evidence()?.locator?.page)
  readonly evidenceBox = computed(() => normalizeEvidenceBox(this.evidence()?.locator?.box))
  readonly evidenceRotation = computed(() =>
    normalizePdfEvidenceRotation(this.evidence()?.locator?.recognitionRotation)
  )
  readonly evidenceSearchTerms = computed(() => {
    const evidence = this.evidence()
    return [evidence?.displayValue, evidence?.text].filter((value): value is string => Boolean(value?.trim()))
  })
  readonly basePreviewUrl = computed(() => this.file.previewUrl || this.file.url)
  readonly previewUrl = computed(() => appendPdfPageAnchor(this.basePreviewUrl(), this.evidencePage()))
  readonly controlledPdfEvidence = computed(() => this.previewKind() === 'pdf' && !!this.evidenceBox())
  readonly rawPreviewSource = computed(() =>
    toFilePreviewSource({
      mimeType: this.file.mimeType,
      name: this.file.name,
      url: this.previewUrl()
    })
  )
  readonly previewKind = computed(() => resolveFilePreviewKind(this.rawPreviewSource()))
  readonly previewTooLarge = computed(
    () =>
      typeof this.file.size === 'number' &&
      Number.isFinite(this.file.size) &&
      this.file.size > WORKBENCH_FILE_PREVIEW_MAX_BYTES
  )
  readonly fileSizeLabel = computed(() => formatFileSize(this.file.size ?? null))
  readonly previewSizeLimitLabel = computed(() => formatFileSize(this.filePreviewSizeLimit))
  readonly previewSource = computed(() => (this.previewTooLarge() ? null : this.rawPreviewSource()))
  readonly previewState = createFilePreviewState(this.previewSource, loadTextPreview)
  readonly previewContent = this.previewState.content
  readonly previewData = this.previewState.previewData
  readonly previewError = computed(() => (this.previewTooLarge() ? 'file-too-large' : this.previewState.previewError()))
  readonly previewLoading = computed(() => (this.previewTooLarge() ? false : this.previewState.previewLoading()))
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
    width: 'min(1440px, calc(100vw - 28px))',
    height: 'min(960px, calc(100vh - 28px))',
    maxWidth: 'calc(100vw - 28px)',
    maxHeight: 'calc(100vh - 28px)',
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

function appendPdfPageAnchor(url: string, page?: number) {
  if (!page || !Number.isInteger(page) || page <= 0) {
    return url
  }

  const [base, hash = ''] = url.split('#', 2)
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  params.set('page', String(page))
  return `${base}#${params.toString()}`
}

function normalizeEvidenceBox(box?: WorkbenchOpenFileEvidenceBox) {
  if (!box) {
    return null
  }

  const x = clamp01(box.x)
  const y = clamp01(box.y)
  return {
    x,
    y,
    width: Math.min(clamp01(box.width), 1 - x),
    height: Math.min(clamp01(box.height), 1 - y)
  }
}

function formatFileSize(size: number | null) {
  if (size === null || !Number.isFinite(size) || size < 0) {
    return null
  }

  if (size < 1024) {
    return `${size} B`
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`
  }

  return `${(size / (1024 * 1024)).toFixed(size < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.min(1, Math.max(0, value))
}
