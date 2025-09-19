import { CommonModule } from '@angular/common'
import { Component, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'

@Component({
  standalone: true,
  selector: 'xp-knowledge-file-system',
  templateUrl: './file-system.component.html',
  styleUrl: './file-system.component.scss',
  imports: [CommonModule, FormsModule, TranslateModule, NgmSpinComponent]
})
export class KnowledgeFileSystemComponent {
  readonly items = input<FileSystemItem[]>()

  toggleDirectory(item: FileSystemItem) {
    if (item.metadata.type === 'directory') {
      item.expanded = !item.expanded
    }
  }
}

export interface FileMetadata {
  path: string
  size: number
  lastModified: string
  type: 'file' | 'directory'
  source: string
  name: string
}

export interface FileSystemItem {
  pageContent: string
  metadata: FileMetadata
  children?: FileSystemItem[]
  expanded?: boolean
}
