
import { ChangeDetectionStrategy, Component, computed, inject, input, model } from '@angular/core'
import { TMessageContentComplex } from '@cloud/app/@core/types'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar'
import { TranslateModule } from '@ngx-translate/core'
import { ChatService } from '../../chat.service'
import { TCopilotChatMessage } from '../../types'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
@Component({
  standalone: true,
  imports: [TranslateModule, ...ZardTooltipImports, EmojiAvatarComponent],
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
  readonly agent = computed(() => {
    const agentKey = this.content()?.agentKey
    return agentKey && this.agents()[agentKey]
  })
  readonly xpert = computed(() => {
    const xpertName = this.content()?.xpertName
    return xpertName && this.xperts()[xpertName]
  })

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
