import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, viewChild } from '@angular/core'
import { FileWorkbenchComponent, FileWorkbenchFileLoader, FileWorkbenchFileSaver, FileWorkbenchFilesLoader } from '@cloud/app/@shared/files'
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
  readonly workspaceId = computed(() => this.xpert()?.workspaceId ?? null)
  readonly rootLabel = computed(() => '.xpert/memory')
  readonly reloadKey = computed(() => this.workspaceId() ?? '__hosted__')

  readonly loadMemoryFiles: FileWorkbenchFilesLoader = (path?: string) => {
    const xpertId = this.xpertId()
    if (!xpertId) {
      return []
    }

    return this.#fileMemoryAPI.getFiles(xpertId, this.workspaceId(), path ?? '')
  }

  readonly loadMemoryFile: FileWorkbenchFileLoader = (path: string) => {
    const xpertId = this.xpertId()
    if (!xpertId) {
      throw new Error('Xpert context is required')
    }

    return this.#fileMemoryAPI.getFile(xpertId, this.workspaceId(), path)
  }

  readonly saveMemoryFile: FileWorkbenchFileSaver = (path: string, content: string) => {
    const xpertId = this.xpertId()
    if (!xpertId) {
      throw new Error('Xpert context is required')
    }

    return this.#fileMemoryAPI.saveFile(xpertId, this.workspaceId(), path, content)
  }

  readonly effectiveFileSaver = computed<FileWorkbenchFileSaver | null>(() => {
    const activePath = this.fileWorkbench()?.activeFilePath()
    return isManagedMemoryIndexPath(activePath) ? null : this.saveMemoryFile
  })
}

function isManagedMemoryIndexPath(filePath?: string | null) {
  const normalized = (filePath ?? '').trim().replace(/\\/g, '/')
  return normalized === 'MEMORY.md' || normalized.endsWith('/MEMORY.md')
}
