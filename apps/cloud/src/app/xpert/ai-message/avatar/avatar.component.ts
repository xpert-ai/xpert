import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, input, model } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { TMessageContentComplex } from '@cloud/app/@core/types'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar'
import { TranslateModule } from '@ngx-translate/core'
import { ChatService } from '../../chat.service'
import { TCopilotChatMessage } from '../../types'

@Component({
  standalone: true,
  imports: [CommonModule, TranslateModule, MatTooltipModule, EmojiAvatarComponent],
  selector: 'chat-message-avatar',
  templateUrl: './avatar.component.html',
  styleUrl: 'avatar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [],
  host: {
    '[class.show]': 'show()'
  }
})
export class ChatMessageAvatarComponent {
  readonly chatService = inject(ChatService)

  // Inputs
  readonly message = input<TCopilotChatMessage>()
  readonly prevContent = input<TMessageContentComplex>()
  readonly content = input<TMessageContentComplex>()
  readonly collapse = model<boolean>()

  readonly submessage = computed(() => this.content())

  readonly project = this.chatService.project
  readonly agents = computed(
    () =>
      this.chatService.xpert()?.agents?.reduce((acc, agent) => {
        acc[agent.key] = agent
        return acc
      }, {}) ?? {}
  )
  readonly xperts = computed(
    () =>
      this.project()?.xperts?.reduce((items, xpert) => {
        items[xpert.name] = xpert
        return items
      }, {}) ?? {}
  )

  // Avatar
  readonly agent = computed(() => this.content()?.agentKey && this.agents()[this.content().agentKey])
  readonly xpert = computed(() => this.content()?.xpertName && this.xperts()[this.content().xpertName])

  readonly show = computed(() => {
    return this.agent()
      ? this.agent().key !== this.prevContent()?.agentKey
      : this.xpert()
        ? this.xpert().name !== this.prevContent()?.xpertName
        : null
  })

  toggleCollapse(message: TMessageContentComplex) {
    if (message.type === 'text') {
      this.collapse.update((state) => !state)
    }
  }
}
