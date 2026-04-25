import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { TFile, TFileDirectory } from '@xpert-ai/contracts'
import { TranslatePipe } from '@xpert-ai/core'
import { of } from 'rxjs'
import { ProjectCoreService } from '../../../@core/services/project-core.service'
import { FileWorkbenchComponent } from '../../../@shared/files'
import { ProjectPageFacade } from '../project-page.facade'

@Component({
  standalone: true,
  selector: 'xp-project-files-page',
  imports: [CommonModule, TranslatePipe, FileWorkbenchComponent],
  templateUrl: './project-files-page.component.html',
  styles: `:host {
    display: flex;
    min-height: 0;
    flex: 1 1 auto;
  }`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProjectFilesPageComponent {
  readonly #projectCoreService = inject(ProjectCoreService)
  readonly facade = inject(ProjectPageFacade)

  readonly loadProjectFiles = (path?: string) => {
    const projectId = this.facade.projectId()
    return projectId ? this.#projectCoreService.getFiles(projectId, path ?? '') : of<TFileDirectory[]>([])
  }

  readonly loadProjectFile = (path: string) => {
    const projectId = this.facade.projectId()
    return projectId ? this.#projectCoreService.getFile(projectId, path) : of<TFile | null>(null)
  }

  readonly saveProjectFile = (path: string, content: string) => {
    const projectId = this.requireProjectId()
    return this.#projectCoreService.saveFile(projectId, path, content)
  }

  readonly uploadProjectFile = (file: File, path: string) => {
    const projectId = this.requireProjectId()
    return this.#projectCoreService.uploadFile(projectId, file, path)
  }

  readonly deleteProjectFile = (path: string) => {
    const projectId = this.requireProjectId()
    return this.#projectCoreService.deleteFile(projectId, path)
  }

  private requireProjectId() {
    const projectId = this.facade.projectId()
    if (!projectId) {
      throw new Error('Project id is required.')
    }
    return projectId
  }
}
