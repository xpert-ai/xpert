import { CommonModule } from '@angular/common'
import { Component, computed, inject, input, model } from '@angular/core'
import { KnowledgebaseService, KnowledgeFileUploader } from '@cloud/app/@core'
import { TranslateModule } from '@ngx-translate/core'


@Component({
  standalone: true,
  imports: [CommonModule, TranslateModule],
  selector: 'xp-knowledge-local-file',
  templateUrl: 'local-file.component.html',
  styleUrls: ['local-file.component.scss']
})
export class KnowledgeLocalFileComponent {
  readonly kbAPI = inject(KnowledgebaseService)

  // Inputs
  readonly knowledgebaseId = input.required<string>()
  readonly files = model<KnowledgeFileUploader[]>([])
  readonly parentId = input<string>(null)
  readonly path = input<string>(null)
  readonly accepts = input<string[]>(null)

  readonly selected = model<KnowledgeFileUploader | null>(null)

  // States
  readonly extensions = computed(() => {
    const exts = this.accepts()
    if (exts && exts.length) {
      return exts.filter(Boolean).map((ext) => ext.startsWith('.') ? ext.slice(1) : ext)
    }
    return ['txt', 'markdown', 'mdx', 'pdf', 'html', 'xlsx', 'xls', 'docx', 'pptx', 'csv', 'epub', 'md', 'htm', 'csv', 'odt', 'odp', 'ods']
  })

  readonly extensionStr = computed(() => this.extensions()?.join(', '))
  readonly acceptsStr = computed(() => this.accepts()?.join(', '))

  // Handle file input (from drag or select)
  handleFiles(selectedFiles: FileList | null) {
    if (!selectedFiles) return
    const newFiles: KnowledgeFileUploader[] = Array.from(selectedFiles).map((file) => {
      const uploader = new KnowledgeFileUploader(this.knowledgebaseId(), this.kbAPI, file, {
        parentId: this.parentId(),
        path: this.path()
      })
      uploader.upload()
      return uploader
    })
    this.files.update((prev) => [...prev, ...newFiles])
  }

  // Drag & drop events
  onDrop(event: DragEvent) {
    event.preventDefault()
    if (event.dataTransfer?.files) {
      this.handleFiles(event.dataTransfer.files)
    }
  }

  onDragOver(event: DragEvent) {
    event.preventDefault()
  }

  // Remove file
  removeFile(index: number) {
    this.files.update((prev) => prev.filter((_, i) => i !== index))
  }

}
