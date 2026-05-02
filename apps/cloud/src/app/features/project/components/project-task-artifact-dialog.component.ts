import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  IProjectTask,
  IProjectTaskExecutionArtifact,
  ProjectTaskExecutionArtifactTypeEnum,
  TFile,
  TFileDirectory
} from '@xpert-ai/contracts'
import { ZardIconComponent } from '@xpert-ai/headless-ui'
import { of } from 'rxjs'
import { ProjectCoreService } from '../../../@core/services/project-core.service'
import { FileWorkbenchComponent } from '../../../@shared/files'

export type ProjectWorkspaceTaskArtifact =
  | Extract<IProjectTaskExecutionArtifact, { type: ProjectTaskExecutionArtifactTypeEnum.ProjectFile }>
  | Extract<IProjectTaskExecutionArtifact, { type: ProjectTaskExecutionArtifactTypeEnum.ProjectDirectory }>
export type ProjectExternalUrlTaskArtifact = Extract<
  IProjectTaskExecutionArtifact,
  { type: ProjectTaskExecutionArtifactTypeEnum.ExternalUrl }
>

type ProjectTaskArtifactDialogData = {
  projectId: string
  artifact: ProjectWorkspaceTaskArtifact
  taskTitle?: string | null
}

@Component({
  standalone: true,
  selector: 'xp-project-task-artifact-dialog',
  imports: [CommonModule, TranslateModule, ZardIconComponent, FileWorkbenchComponent],
  template: `
    <section
      class="flex h-[min(84vh,58rem)] w-[min(72rem,calc(100vw-2rem))] min-h-0 flex-col overflow-hidden rounded-2xl border border-divider-regular bg-components-panel-bg shadow-xl"
    >
      <div class="flex items-start justify-between gap-3 border-b border-divider-regular px-4 py-3">
        <div class="min-w-0">
          <div class="text-xs font-semibold uppercase tracking-[0.18em] text-text-tertiary">
            {{ 'PAC.Project.TaskArtifact' | translate: { Default: 'Task artifact' } }}
          </div>
          <div class="mt-1 truncate text-base font-semibold text-text-primary">{{ artifact().name }}</div>
          @if (taskTitle()) {
            <div class="mt-1 truncate text-xs text-text-tertiary">{{ taskTitle() }}</div>
          }
          <div class="mt-2 truncate font-mono text-xs text-text-secondary">{{ artifactPath() }}</div>
        </div>

        <button
          type="button"
          class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-divider-regular bg-background-default-subtle text-text-secondary transition-colors hover:border-divider-deep hover:text-text-primary"
          [attr.aria-label]="'COMPONENTS.COMMON.CLOSE' | translate: { Default: 'Close' }"
          (click)="close()"
        >
          <z-icon zType="x" class="text-base"></z-icon>
        </button>
      </div>

      <pac-file-workbench
        class="flex min-h-0 flex-1 overflow-hidden bg-components-panel-bg"
        [rootId]="projectId()"
        [rootLabel]="artifact().name"
        [filesLoader]="loadProjectFiles"
        [fileLoader]="loadProjectFile"
        [initialPath]="artifactPath()"
        [initialPathIsDirectory]="artifactIsDirectory()"
        treeSize="default"
      />
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProjectTaskArtifactDialogComponent {
  readonly #dialogRef = inject(DialogRef)
  readonly #data = inject<ProjectTaskArtifactDialogData>(DIALOG_DATA)
  readonly #projectCoreService = inject(ProjectCoreService)

  readonly projectId = signal(this.#data.projectId)
  readonly artifact = signal(this.#data.artifact)
  readonly taskTitle = signal(this.#data.taskTitle ?? null)
  readonly artifactPath = computed(() => projectArtifactPath(this.artifact()))
  readonly artifactIsDirectory = computed(
    () => this.artifact().type === ProjectTaskExecutionArtifactTypeEnum.ProjectDirectory
  )

  readonly loadProjectFiles = (path?: string) => {
    const projectId = this.projectId()
    return projectId ? this.#projectCoreService.getFiles(projectId, path ?? '') : of<TFileDirectory[]>([])
  }

  readonly loadProjectFile = (path: string) => {
    const projectId = this.projectId()
    return projectId ? this.#projectCoreService.getFile(projectId, path) : of<TFile | null>(null)
  }

  close() {
    this.#dialogRef.close()
  }
}

export function isProjectWorkspaceArtifact(
  artifact?: IProjectTaskExecutionArtifact | null
): artifact is ProjectWorkspaceTaskArtifact {
  if (!artifact) {
    return false
  }

  if (
    artifact.type !== ProjectTaskExecutionArtifactTypeEnum.ProjectFile &&
    artifact.type !== ProjectTaskExecutionArtifactTypeEnum.ProjectDirectory
  ) {
    return false
  }

  return typeof artifact.path === 'string' && projectArtifactPath(artifact).length > 0
}

export function isExternalUrlArtifact(
  artifact?: IProjectTaskExecutionArtifact | null
): artifact is ProjectExternalUrlTaskArtifact {
  return (
    artifact?.type === ProjectTaskExecutionArtifactTypeEnum.ExternalUrl &&
    typeof artifact.url === 'string' &&
    artifact.url.trim().length > 0
  )
}

export function projectArtifactPath(artifact: ProjectWorkspaceTaskArtifact) {
  return normalizeProjectArtifactPath(artifact.path)
}

export function openProjectTaskArtifactDialog(
  dialog: Dialog,
  task: IProjectTask,
  artifact: ProjectWorkspaceTaskArtifact
) {
  const projectId = task.projectId ?? task.latestExecution?.projectId
  if (!projectId) {
    return null
  }

  return dialog.open(ProjectTaskArtifactDialogComponent, {
    backdropClass: 'xp-overlay-share-sheet',
    panelClass: 'xp-overlay-pane-share-sheet',
    data: {
      projectId,
      artifact,
      taskTitle: task.title ?? null
    } satisfies ProjectTaskArtifactDialogData
  })
}

function normalizeProjectArtifactPath(path: string) {
  return path
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^\.\//, '')
    .replace(/\/+/g, '/')
    .replace(/\/+$/, '')
}
