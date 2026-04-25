import { Dialog } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core'
import { RouterModule } from '@angular/router'
import type { IProjectCore } from '@xpert-ai/contracts'
import { TranslatePipe } from '@xpert-ai/core'
import { NgmSpinComponent } from '@xpert-ai/ocap-angular/common'
import {
  ZardButtonComponent,
  ZardIconComponent,
  ZardSelectImports,
  ZardTabsImports,
  type ZardSelectValue
} from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { ProjectBindAssistantDialogComponent } from './components/project-bind-assistant-dialog.component'
import { ProjectCreateDialogComponent } from './components/project-create-dialog.component'
import { ProjectEmptyStateComponent } from './components/project-empty-state.component'
import { ProjectSprintCreateDialogComponent } from './components/project-sprint-create-dialog.component'
import { ProjectTaskDialogComponent } from './components/project-task-dialog.component'
import { ProjectTeamBindingsDialogComponent } from './components/project-team-bindings-dialog.component'
import { getDefaultTaskSwimlane, formatProjectLabel } from './project-page.utils'
import { ProjectPageFacade, type ProjectShellTabPath } from './project-page.facade'

type ProjectShellTab = {
  path: ProjectShellTabPath
  labelKey: string
  defaultLabel: string
  icon: string
}

@Component({
  standalone: true,
  selector: 'xp-project-shell',
  imports: [
    CommonModule,
    RouterModule,
    TranslatePipe,
    NgmSpinComponent,
    ZardButtonComponent,
    ZardIconComponent,
    ...ZardSelectImports,
    ...ZardTabsImports,
    ProjectEmptyStateComponent
  ],
  templateUrl: './project-shell.component.html',
  styles: `:host {
    display: block;
    width: 100%;
    height: 100%;
    max-width: 100%;
    min-height: 0;
    overflow: hidden;
  }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ProjectPageFacade]
})
export class ProjectShellComponent {
  readonly #dialog = inject(Dialog)
  readonly facade = inject(ProjectPageFacade)

  readonly tabs: ProjectShellTab[] = [
    {
      path: 'overview',
      labelKey: 'PAC.Project.Overview',
      defaultLabel: 'Overview',
      icon: 'ri-dashboard-line'
    },
    {
      path: 'kanban',
      labelKey: 'PAC.Project.Kanban',
      defaultLabel: 'Kanban',
      icon: 'ri-kanban-view-2-line'
    },
    {
      path: 'teams',
      labelKey: 'PAC.Project.Teams',
      defaultLabel: 'Teams',
      icon: 'ri-group-line'
    },
    {
      path: 'files',
      labelKey: 'PAC.Project.Files',
      defaultLabel: 'Files',
      icon: 'ri-folder-3-line'
    }
  ]

  readonly projectStatusLabel = computed(() => formatProjectLabel(this.facade.selectedProject()?.status))
  readonly projectSummary = computed(() => {
    const project = this.facade.selectedProject()
    return project?.goal || project?.description || ''
  })

  projectTabLink(path: ProjectShellTabPath) {
    const projectId = this.facade.projectId()
    return projectId ? ['/project', projectId, path] : ['/project']
  }

  onProjectSelected(value: ZardSelectValue | ZardSelectValue[]) {
    if (typeof value === 'string' && value) {
      void this.facade.selectProject(value)
      return
    }

    if (typeof value === 'number') {
      void this.facade.selectProject(String(value))
    }
  }

  async openCreateProject() {
    const dialogRef = this.#dialog.open<IProjectCore>(ProjectCreateDialogComponent, {
      disableClose: true,
      backdropClass: 'xp-overlay-share-sheet',
      panelClass: 'xp-overlay-pane-share-sheet'
    })

    const project = await firstValueFrom(dialogRef.closed, { defaultValue: undefined })
    if (project?.id) {
      await this.facade.selectProject(project.id)
    }
  }

  async openBindMainAgent(project?: IProjectCore | null) {
    if (!project?.id) {
      return
    }

    const dialogRef = this.#dialog.open<IProjectCore>(ProjectBindAssistantDialogComponent, {
      disableClose: true,
      backdropClass: 'xp-overlay-share-sheet',
      panelClass: 'xp-overlay-pane-share-sheet',
      data: {
        project
      }
    })

    const updatedProject = await firstValueFrom(dialogRef.closed, { defaultValue: undefined })
    if (updatedProject?.id) {
      await this.facade.refresh()
    }
  }

  async openManageTeams(project?: IProjectCore | null) {
    if (!project?.id) {
      return
    }

    const dialogRef = this.#dialog.open<boolean>(ProjectTeamBindingsDialogComponent, {
      disableClose: true,
      backdropClass: 'xp-overlay-share-sheet',
      panelClass: 'xp-overlay-pane-share-sheet',
      data: {
        project
      }
    })

    const updated = await firstValueFrom(dialogRef.closed, { defaultValue: undefined })
    if (updated) {
      await this.facade.refresh()
    }
  }

  async openCreateSprint() {
    const project = this.facade.selectedProject()
    if (!project?.id) {
      return
    }

    const backlogLane = this.facade.backlogSwimlane()
    const backlogTasks = backlogLane?.id
      ? this.facade.tasks().filter((task) => task.swimlaneId === backlogLane.id)
      : []

    const dialogRef = this.#dialog.open(ProjectSprintCreateDialogComponent, {
      disableClose: true,
      backdropClass: 'xp-overlay-share-sheet',
      panelClass: 'xp-overlay-pane-share-sheet',
      data: {
        project,
        currentSprint: this.facade.selectedSprint(),
        backlogTasks
      }
    })

    const sprint = await firstValueFrom(dialogRef.closed, { defaultValue: undefined })
    if (sprint?.id) {
      await this.facade.refresh()
      await this.facade.selectSprint(sprint.id)
    }
  }

  async openTaskDialog(taskId?: string | null, preferredSwimlaneId?: string | null) {
    const project = this.facade.selectedProject()
    const sprint = this.facade.selectedSprint()

    if (!project?.id || !sprint?.id) {
      return
    }

    const task = taskId ? this.facade.tasks().find((item) => item.id === taskId) ?? null : null
    const defaultSwimlaneId = preferredSwimlaneId ?? getDefaultTaskSwimlane(this.facade.swimlanes())?.id ?? null
    const dialogRef = this.#dialog.open(ProjectTaskDialogComponent, {
      disableClose: true,
      backdropClass: 'xp-overlay-share-sheet',
      panelClass: 'xp-overlay-pane-share-sheet',
      data: {
        project,
        sprint,
        swimlanes: this.facade.swimlanes(),
        tasks: this.facade.tasks(),
        boundTeams: this.facade.boundTeams(),
        task,
        preferredSwimlaneId: defaultSwimlaneId
      }
    })

    const result = await firstValueFrom(dialogRef.closed, { defaultValue: undefined })
    if (result) {
      await this.facade.refreshBoard()
    }
  }
}
