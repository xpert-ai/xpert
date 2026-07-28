import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core'
import { TMessageComponent, TMessageComponentStep } from '@xpert-ai/cloud/state'
import { ChatToolCallChunkComponent } from '@cloud/app/@shared/chat'
import { XpertHomeService } from '../../home.service'
import { ChatService } from '../../chat.service'

/**
 * Displays a generic dashboard/tool component message.
 *
 * Data/BI-specific renderers live in Data X. The host only renders the
 * plugin-provided chunk and can open it in the generic canvas.
 */
@Component({
  standalone: true,
  imports: [ChatToolCallChunkComponent],
  selector: 'chat-message-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrl: 'dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatMessageDashboardComponent {
  readonly homeService = inject(XpertHomeService)
  readonly chatService = inject(ChatService)

  readonly messageId = input<string>()
  readonly message = input<any>()
  readonly inline = input<boolean>(true)

  readonly data = computed(() => this.message()?.data as TMessageComponent<TMessageComponentStep>)
  readonly conversationStatus = computed(() => this.chatService.conversation()?.status)

  openCanvas() {
    this.homeService.canvasOpened.set({
      opened: true,
      type: 'Dashboard',
      messageId: this.messageId(),
      componentId: this.message().id
    })
  }
}
