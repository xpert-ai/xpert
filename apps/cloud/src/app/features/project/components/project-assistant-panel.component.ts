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
  styles: `:host {
    display: flex;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }`,
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
  readonly #logPrefix = '[ProjectChatKit]'

  readonly project = input<IProjectCore | null>(null)
  readonly loading = input(false)
  readonly bindRequested = output<void>()
  readonly projectDataRefreshRequested = output<void>()

  readonly facade = inject(ProjectAssistantFacade)

  constructor() {
    this.facade.setProjectDataRefreshRequested(() => {
      console.debug(this.#logPrefix, 'Panel received project data refresh request from facade', {
        projectId: this.project()?.id ?? null
      })
      this.projectDataRefreshRequested.emit()
    })

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
