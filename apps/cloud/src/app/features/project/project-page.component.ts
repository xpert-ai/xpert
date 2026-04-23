import { Dialog } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { firstValueFrom } from 'rxjs'
import { ZardButtonComponent, ZardIconComponent } from '@xpert-ai/headless-ui'
import { NgmSpinComponent } from '@xpert-ai/ocap-angular/common'
import { TranslatePipe } from '@xpert-ai/core'
import type { IProjectCore } from '@xpert-ai/contracts'
import { ProjectPageFacade } from './project-page.facade'
import { ProjectAssistantPanelComponent } from './components/project-assistant-panel.component'
import { ProjectBoardComponent } from './components/project-board.component'
import { ProjectBoardHeaderComponent } from './components/project-board-header.component'
import { ProjectBindAssistantDialogComponent } from './components/project-bind-assistant-dialog.component'
import { ProjectCreateDialogComponent } from './components/project-create-dialog.component'
import { ProjectEmptyStateComponent } from './components/project-empty-state.component'
import { ProjectSidebarComponent } from './components/project-sidebar.component'
import { ProjectSprintCreateDialogComponent } from './components/project-sprint-create-dialog.component'
import { ProjectSprintSummaryComponent } from './components/project-sprint-summary.component'
import { ProjectTaskDialogComponent } from './components/project-task-dialog.component'
import { ProjectTeamBindingsDialogComponent } from './components/project-team-bindings-dialog.component'
import { ProjectTeamSummaryComponent } from './components/project-team-summary.component'
import { getDefaultTaskSwimlane } from './project-page.utils'

@Component({
  standalone: true,
  selector: 'xp-project-page',
  imports: [
    CommonModule,
    TranslatePipe,
    NgmSpinComponent,
    ZardButtonComponent,
    ZardIconComponent,
    ProjectSidebarComponent,
    ProjectAssistantPanelComponent,
    ProjectBoardHeaderComponent,
    ProjectTeamSummaryComponent,
    ProjectSprintSummaryComponent,
    ProjectBoardComponent,
    ProjectEmptyStateComponent
  ],
  templateUrl: './project-page.component.html',
  styles: `:host {
    display: block;
    width: 100%;
  }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ProjectPageFacade]
})
export class ProjectPageComponent {
  readonly #dialog = inject(Dialog)
  readonly facade = inject(ProjectPageFacade)

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
    if (!updatedProject?.id) {
      return
    }

    await this.facade.refresh()
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
    if (!updated) {
      return
    }

    await this.facade.refresh()
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
