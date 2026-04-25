import { BreakpointObserver } from '@angular/cdk/layout'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { IProjectSprint } from '@xpert-ai/contracts'
import { TranslatePipe } from '@xpert-ai/core'
import { ZardButtonComponent, ZardIconComponent, ZardSelectImports, type ZardSelectValue } from '@xpert-ai/headless-ui'
import { NgmResizableDirective } from '@xpert-ai/ocap-angular/common'
import { map } from 'rxjs'
import { ProjectAssistantPanelComponent } from '../components/project-assistant-panel.component'
import { ProjectBoardComponent } from '../components/project-board.component'
import { ProjectEmptyStateComponent } from '../components/project-empty-state.component'
import { ProjectSprintSummaryComponent } from '../components/project-sprint-summary.component'
import { formatProjectLabel } from '../project-page.utils'
import { ProjectPageFacade } from '../project-page.facade'
import { ProjectShellComponent } from '../project-shell.component'

@Component({
  standalone: true,
  selector: 'xp-project-kanban-page',
  imports: [
    CommonModule,
    TranslatePipe,
    NgmResizableDirective,
    ZardButtonComponent,
    ZardIconComponent,
    ...ZardSelectImports,
    ProjectAssistantPanelComponent,
    ProjectBoardComponent,
    ProjectEmptyStateComponent,
    ProjectSprintSummaryComponent
  ],
  templateUrl: './project-kanban-page.component.html',
  styles: `:host {
    display: flex;
    min-height: 0;
    max-width: 100%;
    flex: 1 1 auto;
  }`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProjectKanbanPageComponent {
  readonly #logPrefix = '[ProjectChatKit]'
  readonly #breakpointObserver = inject(BreakpointObserver)
  readonly shell = inject(ProjectShellComponent)
  readonly facade = inject(ProjectPageFacade)
  readonly desktopAssistantRailLayout = toSignal(
    this.#breakpointObserver.observe('(min-width: 1280px)').pipe(map((state) => state.matches)),
    {
      initialValue:
        typeof window !== 'undefined' && typeof window.matchMedia === 'function'
          ? window.matchMedia('(min-width: 1280px)').matches
          : false
    }
  )

  readonly sprintStatusLabel = computed(() => formatProjectLabel(this.facade.selectedSprint()?.status))
  readonly strategyLabel = computed(() => formatProjectLabel(this.facade.selectedSprint()?.strategyType))

  sprintLabel(sprint: IProjectSprint) {
    return sprint.goal || sprint.id || ''
  }

  onSprintSelected(value: ZardSelectValue | ZardSelectValue[]) {
    if (typeof value === 'string' && value) {
      void this.facade.selectSprint(value)
      return
    }

    if (typeof value === 'number') {
      void this.facade.selectSprint(String(value))
    }
  }

  async handleAssistantProjectDataRefresh() {
    const projectId = this.facade.selectedProject()?.id ?? null
    const sprintId = this.facade.selectedSprint()?.id ?? null

    console.debug(this.#logPrefix, 'Kanban page received assistant-triggered refresh request', {
      projectId,
      sprintId
    })

    try {
      await this.facade.refresh()
      console.debug(this.#logPrefix, 'Kanban page refresh completed', {
        projectId: this.facade.selectedProject()?.id ?? projectId,
        sprintId: this.facade.selectedSprint()?.id ?? sprintId,
        sprintCount: this.facade.sprints().length,
        taskCount: this.facade.tasks().length
      })
    } catch (error) {
      console.debug(this.#logPrefix, 'Kanban page refresh failed', {
        projectId,
        sprintId,
        error
      })
    }
  }
}
