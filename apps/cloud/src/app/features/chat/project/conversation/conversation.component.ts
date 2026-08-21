import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'

import { ChangeDetectionStrategy, Component, computed, effect, inject, ViewContainerRef } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { Router, RouterModule } from '@angular/router'
import { IXpertProject } from '@cloud/app/@core'
import { ChatConversationsComponent, ChatService, XpertChatAppComponent, XpertHomeService } from '@cloud/app/xpert'
import { TranslateModule } from '@ngx-translate/core'
import { injectParams } from 'ngxtension/inject-params'
import { ChatProjectService } from '../chat-project.service'
import { ChatProjectComponent } from '../project.component'
import { ProjectService } from '../project.service'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
import { readNavigationInput } from '@cloud/app/@shared/chat/references'

/**
 *
 */
@Component({
  standalone: true,
  imports: [RouterModule, FormsModule, CdkMenuModule, ...ZardTooltipImports, TranslateModule, XpertChatAppComponent],
  selector: 'xp-chat-project-conv',
  templateUrl: './conversation.component.html',
  styleUrl: 'conversation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ChatProjectService, { provide: ChatService, useExisting: ChatProjectService }]
})
export class ChatProjectConversationComponent {
  readonly chatSercice = inject(ChatProjectService)
  readonly homeService = inject(XpertHomeService)
  readonly projectService = inject(ProjectService)
  readonly #projectComponent = inject(ChatProjectComponent, { optional: true })
  readonly #router = inject(Router)
  readonly #dialog = inject(Dialog)
  readonly #vcr = inject(ViewContainerRef)

  readonly id = injectParams('c')

  readonly project = computed(() => this.#projectComponent?.project() ?? this.projectService.project())
  readonly projectId = computed(() => this.#projectComponent?.id() ?? this.projectService.id())

  readonly canvasOpened = computed(() => this.homeService.canvasOpened()?.opened)

  constructor() {
    const navigationInput = readNavigationInput(this.#router.getCurrentNavigation()?.extras.state)
    if (navigationInput) {
      // Wait until all Signals are initialized before assigning values (linkedModel)
      setTimeout(() => {
        this.chatSercice.project.set(this.project() as IXpertProject)
        this.chatSercice.ask(navigationInput.input, {
          files: this.projectService.files(),
          ...(navigationInput.references?.length ? { references: navigationInput.references } : {})
        })
        this.projectService.attachments.set([])
      })
    }

    effect(() => {
      this.chatSercice.project.set(this.project() as IXpertProject)
    })
  }

  routeProject() {
    this.#router.navigate(['/project', this.projectId()], { queryParams: { chat: 'open' } })
  }

  openConversations() {
    this.#dialog
      .open(ChatConversationsComponent, {
        viewContainerRef: this.#vcr,
        data: {
          basePath: '/project',
          projectId: this.projectId()
        }
      })
      .closed.subscribe({
        next: () => {}
      })
  }
}
