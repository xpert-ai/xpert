import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, effect, inject, model } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { Router, RouterModule } from '@angular/router'
import { injectProjectService } from '@cloud/app/@core'
import { provideOcap } from '@cloud/app/@core/providers/ocap'
import { ChatService, XpertChatAppComponent, XpertOcapService } from '@cloud/app/xpert'
import { provideOcapCore } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { injectParams } from 'ngxtension/inject-params'
import { ChatProjectService } from '../chat-project.service'
import { ChatProjectComponent } from '../project.component'

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
  readonly projectSercice = injectProjectService()
  readonly chatSercice = inject(ChatProjectService)
  readonly #router = inject(Router)

  readonly id = injectParams('c')

  readonly project = this.#projectComponent.project
  readonly projectId = this.#projectComponent.id

  constructor() {
    const navigation = this.#router.getCurrentNavigation()
    if (navigation?.extras.state) {
      const { input } = navigation.extras.state
      // Process the data as needed
      // this.input.set(input)
      this.chatSercice.ask(input)
    }
  }

  routeProject() {
    this.#router.navigate(['/chat/p', this.projectId()])
  }

  openConversations() {}
}
