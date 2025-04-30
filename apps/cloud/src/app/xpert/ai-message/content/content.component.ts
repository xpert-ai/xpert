import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { TMessageContentComplex } from '@cloud/app/@core/types'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar'
import { Copy2Component } from '@cloud/app/@shared/common'
import { listEnterAnimation } from '@metad/core'
import { Indicator } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { MarkdownModule } from 'ngx-markdown'
import { ChatService } from '../../chat.service'
import { ChatComponentMessageComponent } from '../../component-message'
import { XpertOcapService } from '../../ocap.service'
import { TCopilotChatMessage } from '../../types'
import { DateRelativePipe } from '@cloud/app/@core'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    MarkdownModule,
    MatTooltipModule,
    DateRelativePipe,
    EmojiAvatarComponent,
    Copy2Component,
    ChatComponentMessageComponent
  ],
  selector: 'chat-message-content',
  templateUrl: './content.component.html',
  styleUrl: 'content.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [listEnterAnimation]
})
export class ChatMessageContentComponent {
  readonly xpertOcapService = inject(XpertOcapService)
  readonly chatService = inject(ChatService)

  readonly message = input<TCopilotChatMessage>()
  readonly prevContent = input<TMessageContentComplex>()
  readonly content = input<TMessageContentComplex>()
  readonly last = input<boolean>()

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

  readonly collapseMessages = signal<Record<string, boolean>>({})

  // Avatar
  readonly agent = computed(() => this.content()?.agentKey && this.agents()[this.content().agentKey])
  readonly xpert = computed(() => this.content()?.xpertName && this.xperts()[this.content().xpertName])

  toggleCollapseMessage(message: TMessageContentComplex) {
    if (message.type === 'text') {
      this.collapseMessages.update((state) => ({ ...state, [message.id]: !state[message.id] }))
    }
  }

  onCopy(copyButton) {
    copyButton.copied = true
    setTimeout(() => {
      copyButton.copied = false
    }, 3000)
  }

  onRegister(models: { id: string; indicators?: Indicator[] }[]) {
    this.xpertOcapService.registerSemanticModel(models)
  }
}
