import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { TranslatePipe } from '@xpert-ai/core'
import { ZardButtonComponent, ZardIconComponent } from '@xpert-ai/headless-ui'
import { ProjectEmptyStateComponent } from '../components/project-empty-state.component'
import { ProjectPageFacade } from '../project-page.facade'
import { ProjectShellComponent } from '../project-shell.component'

@Component({
  standalone: true,
  selector: 'xp-project-teams-page',
  imports: [CommonModule, TranslatePipe, ZardButtonComponent, ZardIconComponent, ProjectEmptyStateComponent],
  templateUrl: './project-teams-page.component.html',
  styles: `:host {
    display: flex;
    min-height: 0;
    flex: 1 1 auto;
  }`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProjectTeamsPageComponent {
  readonly shell = inject(ProjectShellComponent)
  readonly facade = inject(ProjectPageFacade)
}
