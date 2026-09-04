import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import {
  ZardButtonComponent,
  ZardIconComponent,
  ZardToggleGroupComponent,
  ZardToggleGroupItemComponent
} from '@xpert-ai/headless-ui'
import { KnowledgeFAQImportMode, KnowledgeFAQImportPreview, KnowledgeFAQImportResult } from '@xpert-ai/contracts'
import { firstValueFrom } from 'rxjs'
import { getErrorMessage, KnowledgeFAQService } from '../../../../../@core'

export type KnowledgeFAQImportDialogData = {
  knowledgebaseId: string
}

@Component({
  standalone: true,
  selector: 'xp-knowledge-faq-import-dialog',
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    ZardButtonComponent,
    ZardIconComponent,
    ZardToggleGroupComponent,
    ZardToggleGroupItemComponent
  ],
  templateUrl: './faq-import-dialog.component.html',
  host: {
    class: 'flex max-h-[min(720px,calc(100vh-2rem))] w-[600px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden'
  },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class KnowledgeFAQImportDialogComponent {
  readonly #dialogRef = inject(DialogRef<KnowledgeFAQImportResult | undefined>)
  readonly #data = inject<KnowledgeFAQImportDialogData>(DIALOG_DATA)
  readonly #faqService = inject(KnowledgeFAQService)

  readonly mode = signal<KnowledgeFAQImportMode>('append')
  readonly file = signal<File | null>(null)
  readonly preview = signal<KnowledgeFAQImportPreview | null>(null)
  readonly result = signal<KnowledgeFAQImportResult | null>(null)
  readonly parsing = signal(false)
  readonly importing = signal(false)
  readonly downloadingTemplate = signal(false)
  readonly dragging = signal(false)
  readonly error = signal<string | null>(null)

  close() {
    this.#dialogRef.close(this.result() ?? undefined)
  }

  setMode(mode: KnowledgeFAQImportMode) {
    this.mode.set(mode)
    this.result.set(null)
  }

  selectFile(event: Event) {
    const input = event.target
    if (!(input instanceof HTMLInputElement)) return
    const file = input.files?.item(0)
    if (file) void this.useFile(file)
    input.value = ''
  }

  onDragOver(event: DragEvent) {
    event.preventDefault()
    this.dragging.set(true)
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault()
    this.dragging.set(false)
  }

  onDrop(event: DragEvent) {
    event.preventDefault()
    this.dragging.set(false)
    const file = event.dataTransfer?.files.item(0)
    if (file) void this.useFile(file)
  }

  async useFile(file: File) {
    this.file.set(file)
    this.preview.set(null)
    this.result.set(null)
    this.error.set(null)
    this.parsing.set(true)
    try {
      this.preview.set(await firstValueFrom(this.#faqService.previewImportFile(this.#data.knowledgebaseId, file)))
    } catch (error) {
      this.error.set(getErrorMessage(error))
    } finally {
      this.parsing.set(false)
    }
  }

  async downloadTemplate() {
    if (this.downloadingTemplate()) return
    this.downloadingTemplate.set(true)
    try {
      const blob = await firstValueFrom(this.#faqService.downloadImportTemplate(this.#data.knowledgebaseId))
      triggerDownload(blob, 'faq-import-template.csv')
    } catch (error) {
      this.error.set(getErrorMessage(error))
    } finally {
      this.downloadingTemplate.set(false)
    }
  }

  async importFAQs() {
    const file = this.file()
    if (!file || !this.preview() || this.importing()) return
    this.importing.set(true)
    this.result.set(null)
    this.error.set(null)
    try {
      const result = await firstValueFrom(this.#faqService.importFile(this.#data.knowledgebaseId, file, this.mode()))
      this.result.set(result)
      if (!result.failed.length) this.#dialogRef.close(result)
    } catch (error) {
      this.error.set(getErrorMessage(error))
    } finally {
      this.importing.set(false)
    }
  }
}

function triggerDownload(blob: Blob, fileName: string) {
  const anchor = document.createElement('a')
  const objectUrl = URL.createObjectURL(blob)
  anchor.href = objectUrl
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(objectUrl)
}
