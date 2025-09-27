import { CommonModule } from '@angular/common'
import { Component, inject, input, signal } from '@angular/core'
import { KnowledgebaseService, KnowledgeFileUploader } from '@cloud/app/@core'

// interface UploadFile {
//   name: string
//   size: number
//   type: string
//   storageId?: string // 上传后的文件ID
// }

@Component({
  standalone: true,
  imports: [CommonModule],
  selector: 'xp-knowledge-local-file',
  templateUrl: 'local-file.component.html',
  styleUrls: ['local-file.component.scss']
})
export class KnowledgeLocalFileComponent {
  readonly kbAPI = inject(KnowledgebaseService)

  // Inputs
  readonly knowledgebaseId = input.required<string>()

  // States
  files = signal<KnowledgeFileUploader[]>([])

  // Handle file input (from drag or select)
  handleFiles(selectedFiles: FileList | null) {
    if (!selectedFiles) return
    const newFiles: KnowledgeFileUploader[] = Array.from(selectedFiles).map((file) => {
      const uploader = new KnowledgeFileUploader(this.knowledgebaseId(), this.kbAPI, file,)
      uploader.upload()
      return uploader
    })
    this.files.update((prev) => [...prev, ...newFiles])

    // 选择完文件就上传
    // this.uploadFiles()
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

  // Upload method
  uploadFiles() {
    // TODO: implement upload logic
    console.log('Uploading files:', this.files())
  }

  formatSize(size: number): string {
    if (size < 1024) return `${size}B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`
    return `${(size / (1024 * 1024)).toFixed(1)}MB`
  }
}
