import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { TranslateModule } from '@ngx-translate/core'
import { catchError, filter, firstValueFrom, map, merge, of, startWith, switchMap } from 'rxjs'
import { AssistantBindingScope, AssistantBindingService, AssistantCode, XpertAPIService } from '../../../../@core'
import {
  FileWorkbenchComponent,
  FileWorkbenchFileDeleter,
  FileWorkbenchFileDownloader,
  FileWorkbenchFileLoader,
  FileWorkbenchFileSaver,
  FileWorkbenchFileUploader,
  FileWorkbenchFilesLoader
} from '../../../../@shared/files'

@Component({
  standalone: true,
  selector: 'xp-xpert-workspace-files',
  imports: [TranslateModule, FileWorkbenchComponent],
  templateUrl: './files.component.html',
  styleUrl: './files.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertWorkspaceFilesComponent {
  readonly #assistantBindingService = inject(AssistantBindingService)
  readonly #xpertService = inject(XpertAPIService)

  readonly xpertId = toSignal(
    merge(
      of(null),
      this.#assistantBindingService.changes$.pipe(
        filter((event) => event.code === AssistantCode.CLAWXPERT && event.scope === AssistantBindingScope.USER)
      )
    ).pipe(
      switchMap(() => this.#assistantBindingService.get(AssistantCode.CLAWXPERT, AssistantBindingScope.USER)),
      map((binding) => binding?.assistantId?.trim() || null),
      catchError(() => of(null)),
      startWith(null)
    ),
    { initialValue: null }
  )

  readonly loadFiles: FileWorkbenchFilesLoader = (path) => {
    const xpertId = this.requireXpertId()
    return this.#xpertService.getWorkspaceFiles(xpertId, path ?? '')
  }

  readonly loadFile: FileWorkbenchFileLoader = (path) => {
    return this.#xpertService.getWorkspaceFile(this.requireXpertId(), path)
  }

  readonly saveFile: FileWorkbenchFileSaver = (path, content) => {
    return this.#xpertService.saveWorkspaceFile(this.requireXpertId(), path, content)
  }

  readonly uploadFile: FileWorkbenchFileUploader = (file, path) => {
    return this.#xpertService.uploadWorkspaceFileToFolder(this.requireXpertId(), file, path)
  }

  readonly deleteFile: FileWorkbenchFileDeleter = (path) => {
    return this.#xpertService.deleteWorkspaceFile(this.requireXpertId(), path)
  }

  readonly downloadFile: FileWorkbenchFileDownloader = async (path, item) => {
    const blob = await firstValueFrom(this.#xpertService.downloadWorkspaceFile(this.requireXpertId(), path))
    return {
      kind: 'blob',
      blob,
      fileName: item?.hasChildren ? `${path.split('/').pop() || path}.zip` : path.split('/').pop() || path
    }
  }

  private requireXpertId() {
    const xpertId = this.xpertId()
    if (!xpertId) {
      throw new Error('Claw Xpert is not configured')
    }
    return xpertId
  }
}
