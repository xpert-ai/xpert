import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, input } from '@angular/core'

@Component({
  standalone: true,
  selector: 'xp-project-empty-state',
  imports: [CommonModule],
  templateUrl: './project-empty-state.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProjectEmptyStateComponent {
  readonly icon = input('ri-layout-grid-line')
  readonly title = input('')
  readonly description = input('')
}
