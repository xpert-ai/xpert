import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { TChatConversationOptions } from '@cloud/app/@core'
import { ListHeightStaggerAnimation } from '@xpert-ai/core'
import { TranslateModule } from '@ngx-translate/core'
import { ChatComputerTimelineComponent } from '../../../@shared/chat/computer-timeline/computer-timeline.component'
import { ChatConversationFilesComponent } from '../../../@shared/chat/conversation-files/conversation-files.component'
import { ChatService } from '../../chat.service'
import { XpertHomeService } from '../../home.service'
import { ChatCanvasWebTerminalComponent } from '../web-terminal/terminal.component'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    CdkMenuModule,
    TranslateModule,
    ...ZardTooltipImports,
    ChatComputerTimelineComponent,
    ChatCanvasWebTerminalComponent
  ],
  selector: 'chat-canvas-computer',
  templateUrl: './computer.component.html',
  styleUrl: 'computer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [ListHeightStaggerAnimation],
  host: {
    '[class.expand]': 'expand()'
  }
})
export class ChatCanvasComputerComponent {
  readonly homeService = inject(XpertHomeService)
  readonly chatService = inject(ChatService)
  readonly #dialog = inject(Dialog)

  // Inputs
  readonly componentId = input<string>()

  // States
  readonly expand = signal(false)

  readonly conversationId = this.homeService.conversationId

  readonly projectId = computed(() => this.chatService.project()?.id)

  readonly features = computed(() => [
    'timeline' as TChatConversationOptions['features'][number],
    ...(this.chatService.conversation()?.options?.features ?? [])
  ])
  readonly feature = signal<TChatConversationOptions['features'][number]>('timeline')

  close() {
    this.homeService.canvasOpened.update((state) => ({ ...state, opened: false }))
  }

  toggleExpand() {
    this.expand.update((state) => !state)
  }

  openFiles() {
    this.#dialog.open(ChatConversationFilesComponent, {
      data: {
        projectId: this.projectId(),
        conversationId: this.homeService.conversation().id
      }
    })
  }
}
