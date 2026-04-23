import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core'
import { IProjectCore } from '@xpert-ai/contracts'
import { TranslatePipe } from '@xpert-ai/core'
import { ZardButtonComponent, ZardIconComponent } from '@xpert-ai/headless-ui'
import { ProjectModeTabsComponent } from './project-mode-tabs.component'
import { ProjectSidebarItemComponent } from './project-sidebar-item.component'

@Component({
  standalone: true,
  selector: 'xp-project-sidebar',
  imports: [
    CommonModule,
    TranslatePipe,
    ZardButtonComponent,
    ZardIconComponent,
    ProjectModeTabsComponent,
    ProjectSidebarItemComponent
  ],
  templateUrl: './project-sidebar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProjectSidebarComponent {
  readonly projects = input<IProjectCore[]>([])
  readonly selectedProjectId = input<string | null>(null)
  readonly selectedSprintLabel = input('')
  readonly selectedTaskCount = input(0)
  readonly projectSelected = output<string>()
  readonly createRequested = output<void>()

  onProjectSelected(projectId: string) {
    this.projectSelected.emit(projectId)
  }

  requestCreateProject() {
    this.createRequested.emit()
  }
}
