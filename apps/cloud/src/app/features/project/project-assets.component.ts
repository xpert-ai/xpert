import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core'
import { ActivatedRoute } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import {
  FileWorkbenchComponent,
  FileWorkbenchFileDeleter,
  FileWorkbenchFileLoader,
  FileWorkbenchFileSaver,
  FileWorkbenchFileUploader,
  FileWorkbenchFilesLoader
} from '@cloud/app/@shared/files'
import { XpertProjectApiService } from './project-api.service'
import { XpertProjectFacade } from './project.facade'

@Component({
  standalone: true,
  selector: 'xp-project-assets',
  imports: [TranslateModule, FileWorkbenchComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-h-0 w-full min-w-0' },
  template: `
    <xp-file-workbench
      class="block h-full min-h-0 w-full"
      layout="library"
      [rootId]="projectId"
      [navigationTitle]="'XP.XProject.ProjectLibrary' | translate: { Default: 'Project files' }"
      [treeTitle]="'XP.XProject.ProjectFiles' | translate: { Default: 'Project files' }"
      [searchPlaceholder]="'XP.XProject.SearchProjectFiles' | translate: { Default: 'Search project files' }"
      [rootLabel]="projectName()"
      [filesLoader]="loadFiles"
      [fileLoader]="loadFile"
      [fileSaver]="canEdit() ? saveFile : null"
      [fileUploader]="canEdit() ? uploadFile : null"
      [fileDeleter]="canEdit() ? deleteFile : null"
    />
  `
})
export class XpertProjectAssetsComponent {
  readonly #route = inject(ActivatedRoute)
  readonly #api = inject(XpertProjectApiService)
  readonly facade = inject(XpertProjectFacade)

  readonly projectId = this.#route.parent?.snapshot.paramMap.get('id') ?? ''
  readonly projectName = computed(() => this.facade.project()?.name?.trim() || this.projectId)
  readonly canEdit = computed(() => this.facade.projectAccess()?.capabilities.canEdit === true)

  readonly loadFiles: FileWorkbenchFilesLoader = (path) => this.#api.workspaceFiles(this.projectId, path ?? '')
  readonly loadFile: FileWorkbenchFileLoader = (path) => this.#api.workspaceFile(this.projectId, path)
  readonly saveFile: FileWorkbenchFileSaver = (path, content) =>
    this.#api.saveWorkspaceFile(this.projectId, path, content)
  readonly uploadFile: FileWorkbenchFileUploader = (file, path) =>
    this.#api.uploadWorkspaceFile(this.projectId, file, path)
  readonly deleteFile: FileWorkbenchFileDeleter = (path) => this.#api.deleteWorkspaceFile(this.projectId, path)
}
