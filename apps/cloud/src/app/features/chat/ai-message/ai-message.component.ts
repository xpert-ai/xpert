import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { MarkdownModule } from 'ngx-markdown'
import { MaterialModule } from '../../../@shared'
import { ChatService } from '../chat.service'
import { ChatComponentMessageComponent } from '../component-message/component-message.component'
import { EmojiAvatarComponent } from '../../../@shared/avatar'
import { TCopilotChatMessage } from '../types'
import { CopilotChatMessage, isMessageGroup } from '../../../@core'

interface ICopilotChatMessage extends CopilotChatMessage {
  expanded?: boolean
  // messages: CopilotChatMessage[]
  // data: any[]
}

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    DragDropModule,
    RouterModule,
    TranslateModule,
    CdkMenuModule,
    MarkdownModule,
    MaterialModule,
    NgmCommonModule,
    EmojiAvatarComponent,
    ChatComponentMessageComponent
  ],
  selector: 'pac-ai-message',
  templateUrl: './ai-message.component.html',
  styleUrl: 'ai-message.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatAiMessageComponent {
  readonly chatService = inject(ChatService)

  readonly message = input<TCopilotChatMessage>()

  readonly #contentStr = computed(() => {
    const content = this.message()?.content
    if (typeof content === 'string') {
      const count = (content.match(/```/g) || []).length
      if (count % 2 === 0) {
        return content
      } else {
        return content + '\n```\n'
      }
    }
    return ''
  })

  readonly contentStr = computed(() => {
    const content = this.#contentStr()
    if (['thinking', 'answering'].includes(this.message().status) && this.answering()) {
      return content + '<span class="thinking-placeholder"></span>'
    }
    return content
  })

  readonly contents = computed(() => {
    const contents = this.message()?.content
    if (Array.isArray(contents)) {
      return contents
    }
    return null
  })

  readonly role = this.chatService.xpert
  readonly answering = this.chatService.answering

  readonly messageGroup = computed(() => {
    const message = this.message()
    return isMessageGroup(message) ? message : null
  })

  constructor() {
    effect(() => {
      // console.log(this.contents())
    })
  }

  onCopy(copyButton) {
    copyButton.copied = true
    setTimeout(() => {
      copyButton.copied = false
    }, 3000)
  }
}
