import { Dialog } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { firstValueFrom } from 'rxjs'
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
import { ProjectSprintSummaryComponent } from './components/project-sprint-summary.component'

@Component({
  standalone: true,
  selector: 'xp-project-page',
  imports: [
    CommonModule,
    TranslatePipe,
    NgmSpinComponent,
    ProjectSidebarComponent,
    ProjectAssistantPanelComponent,
    ProjectBoardHeaderComponent,
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
}
