import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core'
import { TranslatePipe } from '@xpert-ai/core'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  selector: 'xp-project-mode-tabs',
  imports: [CommonModule, TranslatePipe, ZardButtonComponent],
  templateUrl: './project-mode-tabs.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProjectModeTabsComponent {
  readonly activeTab = input<'projects' | 'kanban-agent'>('projects')
  readonly tabChanged = output<'projects' | 'kanban-agent'>()

  selectProjects() {
    this.tabChanged.emit('projects')
  }
}
