import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, effect, inject, input, output, untracked } from '@angular/core'
import { TranslatePipe } from '@xpert-ai/core'
import { ZardButtonComponent, ZardIconComponent } from '@xpert-ai/headless-ui'
import { NgmSpinComponent } from '@xpert-ai/ocap-angular/common'
import { ChatKit } from '@xpert-ai/chatkit-angular'
import type { IProjectCore } from '@xpert-ai/contracts'
import { ProjectAssistantFacade } from '../project-assistant.facade'
import { ProjectEmptyStateComponent } from './project-empty-state.component'

@Component({
  standalone: true,
  selector: 'xp-project-assistant-panel',
  imports: [
    CommonModule,
    TranslatePipe,
    NgmSpinComponent,
    ChatKit,
    ProjectEmptyStateComponent,
    ZardButtonComponent,
    ZardIconComponent
  ],
  templateUrl: './project-assistant-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ProjectAssistantFacade]
})
export class ProjectAssistantPanelComponent {
  readonly project = input<IProjectCore | null>(null)
  readonly loading = input(false)
  readonly bindRequested = output<void>()

  readonly facade = inject(ProjectAssistantFacade)

  constructor() {
    effect(
      () => {
        const loading = this.loading()
        const project = this.project()

        untracked(() => {
          this.facade.setPageLoading(loading)
          this.facade.setProject(project)
        })
      },
      { allowSignalWrites: true }
    )
  }

  requestBind() {
    this.bindRequested.emit()
  }
}
