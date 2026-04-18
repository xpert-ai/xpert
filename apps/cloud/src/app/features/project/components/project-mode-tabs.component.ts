import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core'
import { TranslatePipe } from '@xpert-ai/core'

@Component({
  standalone: true,
  selector: 'xp-project-mode-tabs',
  imports: [CommonModule, TranslatePipe],
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
