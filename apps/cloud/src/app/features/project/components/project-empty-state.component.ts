import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
import { ZardCardImports, ZardIconComponent } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  selector: 'xp-project-empty-state',
  imports: [CommonModule, ZardIconComponent, ...ZardCardImports],
  templateUrl: './project-empty-state.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProjectEmptyStateComponent {
  readonly icon = input('ri-layout-grid-line')
  readonly title = input('')
  readonly description = input('')
  readonly iconType = computed(() => {
    switch (this.icon()) {
      case 'ri-building-line':
        return 'corporate_fare'
      case 'ri-calendar-schedule-line':
        return 'today'
      case 'ri-error-warning-line':
        return 'warning'
      case 'ri-layout-grid-line':
        return 'workspaces'
      case 'ri-link':
        return 'link'
      case 'ri-robot-2-line':
        return 'robot_2'
      case 'ri-user-settings-line':
        return 'manage_accounts'
      default:
        return 'dashboard'
    }
  })
}
