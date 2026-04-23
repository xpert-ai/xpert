import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core'
import { IProjectCore } from '@xpert-ai/contracts'
import { TranslatePipe } from '@xpert-ai/core'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'
import { formatProjectLabel } from '../project-page.utils'

@Component({
  standalone: true,
  selector: 'xp-project-sidebar-item',
  imports: [CommonModule, TranslatePipe, ZardButtonComponent],
  templateUrl: './project-sidebar-item.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProjectSidebarItemComponent {
  readonly project = input.required<IProjectCore>()
  readonly active = input(false)
  readonly selectedSprintLabel = input('')
  readonly selectedTaskCount = input(0)
  readonly projectSelected = output<string>()

  readonly goalPreview = computed(() => this.project().goal || this.project().description || '')
  readonly statusLabel = computed(() => formatProjectLabel(this.project().status))

  selectProject() {
    if (!this.project().id) {
      return
    }

    this.projectSelected.emit(this.project().id)
  }
}
