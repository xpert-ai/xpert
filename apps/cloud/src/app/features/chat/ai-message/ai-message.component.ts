import { DragDropModule } from '@angular/cdk/drag-drop'
import { Clipboard } from '@angular/cdk/clipboard'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { MarkdownModule } from 'ngx-markdown'
import { MaterialModule } from '../../../@shared/material.module'
import { ChatService } from '../chat.service'
import { ChatComponentMessageComponent } from '../component-message/component-message.component'
import { EmojiAvatarComponent } from '../../../@shared/avatar'
import { TCopilotChatMessage } from '../types'
import { CopilotChatMessage, injectToastr, isMessageGroup } from '../../../@core'
import { stringifyMessageContent } from '@metad/copilot'


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
  readonly #clipboard = inject(Clipboard)
  readonly #toastr = injectToastr()

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

  readonly copied = signal(false)

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

  copy(message: CopilotChatMessage) {
    this.#clipboard.copy(stringifyMessageContent(message.content))
    this.#toastr.info({ code: 'PAC.KEY_WORDS.Copied', default: 'Copied' })
    this.copied.set(true)
  }
}
