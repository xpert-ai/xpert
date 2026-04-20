import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, viewChild } from '@angular/core'
import {
  FileWorkbenchComponent,
  FileWorkbenchFileDeleter,
  FileWorkbenchFileLoader,
  FileWorkbenchFileSaver,
  FileWorkbenchFileUploader,
  FileWorkbenchFilesLoader
} from '@cloud/app/@shared/files'
import { injectFileMemoryAPI } from '@cloud/app/@core'
import { XpertComponent } from '../../xpert.component'

@Component({
  standalone: true,
  selector: 'xp-xpert-memory-files',
  imports: [CommonModule, FileWorkbenchComponent],
  templateUrl: './files.component.html',
  styleUrl: './files.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertMemoryFilesComponent {
  readonly #fileMemoryAPI = injectFileMemoryAPI()
  readonly xpertComponent = inject(XpertComponent)

  readonly fileWorkbench = viewChild(FileWorkbenchComponent)

  readonly xpertId = this.xpertComponent.paramId
  readonly xpert = computed(() => this.xpertComponent.xpert() ?? this.xpertComponent.latestXpert())
  readonly rootLabel = computed(() => this.xpert()?.title || this.xpert()?.name || 'Memory files')
  readonly reloadKey = computed(() => this.xpertId() ?? '__hosted__')

  readonly loadMemoryFiles: FileWorkbenchFilesLoader = (path?: string) => {
    const xpertId = this.xpertId()
    if (!xpertId) {
      return []
    }

    return this.#fileMemoryAPI.getFiles(xpertId, path ?? '')
  }

  readonly loadMemoryFile: FileWorkbenchFileLoader = (path: string) => {
    const xpertId = this.xpertId()
    if (!xpertId) {
      throw new Error('Xpert context is required')
    }

    return this.#fileMemoryAPI.getFile(xpertId, path)
  }

  readonly saveMemoryFile: FileWorkbenchFileSaver = (path: string, content: string) => {
    const xpertId = this.xpertId()
    if (!xpertId) {
      throw new Error('Xpert context is required')
    }

    return this.#fileMemoryAPI.saveFile(xpertId, path, content)
  }

  readonly uploadMemoryFile: FileWorkbenchFileUploader = (file: File, path: string) => {
    const xpertId = this.xpertId()
    if (!xpertId) {
      throw new Error('Xpert context is required')
    }

    return this.#fileMemoryAPI.uploadFile(xpertId, file, path)
  }

  readonly deleteMemoryFile: FileWorkbenchFileDeleter = (path: string) => {
    const xpertId = this.xpertId()
    if (!xpertId) {
      throw new Error('Xpert context is required')
    }

    return this.#fileMemoryAPI.deleteFile(xpertId, path)
  }

  readonly effectiveFileSaver = computed<FileWorkbenchFileSaver | null>(() => {
    const activePath = this.fileWorkbench()?.activeFilePath()
    return isManagedMemoryIndexPath(activePath) ? null : this.saveMemoryFile
  })

  readonly effectiveFileDeleter = computed<FileWorkbenchFileDeleter | null>(() => {
    const activePath = this.fileWorkbench()?.activeFilePath()
    return isManagedMemoryIndexPath(activePath) ? null : this.deleteMemoryFile
  })

  readonly effectiveFileUploader = computed<FileWorkbenchFileUploader | null>(() => {
    const activePath = this.fileWorkbench()?.activeFilePath()
    return isManagedMemoryIndexPath(activePath) ? null : this.uploadMemoryFile
  })
}

function isManagedMemoryIndexPath(filePath?: string | null) {
  const normalized = (filePath ?? '').trim().replace(/\\/g, '/')
  return normalized === 'MEMORY.md' || normalized.endsWith('/MEMORY.md')
}
