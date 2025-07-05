import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, ViewContainerRef } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { Router, RouterModule } from '@angular/router'
import { injectProjectService, IXpertProject } from '@cloud/app/@core'
import { provideOcap } from '@cloud/app/@core/providers/ocap'
import {
  ChatConversationsComponent,
  ChatService,
  XpertChatAppComponent,
  XpertHomeService,
  XpertOcapService
} from '@cloud/app/xpert'
import { provideOcapCore } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { injectParams } from 'ngxtension/inject-params'
import { ChatProjectService } from '../chat-project.service'
import { ChatProjectComponent } from '../project.component'
import { ProjectService } from '../project.service'

/**
 *
 */
@Component({
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    CdkMenuModule,
    MatTooltipModule,
    TranslateModule,
    XpertChatAppComponent
  ],
  selector: 'pac-chat-project-conv',
  templateUrl: './conversation.component.html',
  styleUrl: 'conversation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    ChatProjectService,
    { provide: ChatService, useExisting: ChatProjectService },
    provideOcapCore(),
    provideOcap(),
    XpertOcapService
  ]
})
export class ChatProjectConversationComponent {
  readonly #projectComponent = inject(ChatProjectComponent)
  readonly #projectsSercice = injectProjectService()
  readonly chatSercice = inject(ChatProjectService)
  readonly homeService = inject(XpertHomeService)
  readonly projectService = inject(ProjectService)
  readonly #router = inject(Router)
  readonly #dialog = inject(Dialog)
  readonly #vcr = inject(ViewContainerRef)

  readonly id = injectParams('c')

  readonly project = this.#projectComponent.project
  readonly projectId = this.#projectComponent.id

  readonly canvasOpened = computed(() => this.homeService.canvasOpened()?.opened)

  constructor() {
    const navigation = this.#router.getCurrentNavigation()
    if (navigation?.extras.state) {
      const { input } = navigation.extras.state
      
      // Wait until all Signals are initialized before assigning values (linkedModel)
      setTimeout(() => {
        this.chatSercice.project.set(this.project() as IXpertProject)
        // Process the data as needed
        this.chatSercice.ask(input, {files: this.projectService.files()?.map((file) => ({id: file.id, originalName: file.originalName}))})
        this.projectService.attachments.set([])
      })
    }

    effect(
      () => {
        this.chatSercice.project.set(this.project() as IXpertProject)
      },
      { allowSignalWrites: true }
    )
  }

  routeProject() {
    this.#router.navigate(['/chat/p', this.projectId()])
  }

  openConversations() {
    this.#dialog
      .open(ChatConversationsComponent, {
        viewContainerRef: this.#vcr,
        data: {
          basePath: '/chat',
          projectId: this.projectId()
        }
      })
      .closed.subscribe({
        next: () => {}
      })
  }
}
