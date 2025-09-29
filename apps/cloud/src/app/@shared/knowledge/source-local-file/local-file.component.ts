import { CommonModule } from '@angular/common'
import { Component, inject, input, model, signal } from '@angular/core'
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

  readonly selected = model<KnowledgeFileUploader | null>(null)

  // States

  // Handle file input (from drag or select)
  handleFiles(selectedFiles: FileList | null) {
    if (!selectedFiles) return
    const newFiles: KnowledgeFileUploader[] = Array.from(selectedFiles).map((file) => {
      const uploader = new KnowledgeFileUploader(this.knowledgebaseId(), this.kbAPI, file, this.parentId())
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
