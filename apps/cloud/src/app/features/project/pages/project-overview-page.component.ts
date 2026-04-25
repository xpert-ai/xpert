import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core'
import { RouterModule } from '@angular/router'
import { TranslatePipe } from '@xpert-ai/core'
import { ZardButtonComponent, ZardIconComponent } from '@xpert-ai/headless-ui'
import { formatProjectLabel } from '../project-page.utils'
import { ProjectPageFacade } from '../project-page.facade'
import { ProjectShellComponent } from '../project-shell.component'

@Component({
  standalone: true,
  selector: 'xp-project-overview-page',
  imports: [CommonModule, RouterModule, TranslatePipe, ZardButtonComponent, ZardIconComponent],
  templateUrl: './project-overview-page.component.html',
  styles: `:host {
    display: flex;
    min-height: 0;
    flex: 1 1 auto;
  }`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProjectOverviewPageComponent {
  readonly shell = inject(ProjectShellComponent)
  readonly facade = inject(ProjectPageFacade)

  readonly sprintStatusLabel = computed(() => formatProjectLabel(this.facade.selectedSprint()?.status))
  readonly assistantStatusLabel = computed(() =>
    this.facade.selectedProject()?.mainAssistantId
      ? 'PAC.Project.AssistantBound'
      : 'PAC.Project.AssistantMissing'
  )
  readonly assistantStatusDefault = computed(() =>
    this.facade.selectedProject()?.mainAssistantId ? 'Bound' : 'Missing'
  )
}
