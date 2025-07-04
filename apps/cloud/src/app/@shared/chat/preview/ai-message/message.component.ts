import { CommonModule } from '@angular/common'
import { Component, computed, effect, input, signal } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ListHeightStaggerAnimation } from '@metad/core'
import { TranslateModule } from '@ngx-translate/core'
import { IChatConversation, IChatMessage } from 'apps/cloud/src/app/@core'
import { NgxJsonViewerModule } from 'ngx-json-viewer'
import { MarkdownModule } from 'ngx-markdown'
import { Copy2Component } from '../../../common'
import { ChatToolCallChunkComponent } from '../../tool-call-chunk/tool-call-chunk.component'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    MatTooltipModule,
    MarkdownModule,
    Copy2Component,
    NgxJsonViewerModule,
    ChatToolCallChunkComponent
  ],
  selector: 'xpert-preview-ai-message',
  templateUrl: 'message.component.html',
  styleUrls: ['message.component.scss'],
  animations: [ListHeightStaggerAnimation]
})
export class XpertPreviewAiMessageComponent {

  // Inputs
  readonly message = input<IChatMessage>()
  readonly conversation = input<Partial<IChatConversation>>()

  // States
  readonly contents = computed(() => {
    const messageContent = this.message()?.content
    if (typeof messageContent === 'string') {
      return [
        {
          type: 'text',
          text: this.message().content
        }
      ]
    } else if (Array.isArray(messageContent)) {
      return messageContent
    }

    return null
  })

  readonly thirdPartyMessage = computed(() => this.message().thirdPartyMessage)
  readonly reasoning = computed(() => this.message().reasoning)
  readonly reasoningText = computed(() =>
    this.reasoning()
      .map(({ text }) => text)
      .join('\n\n')
  )
  readonly #steps = computed(() => this.message().events)
  readonly lastStep = computed(() =>
    this.message().events ? this.message().events[this.message().events.length - 1] : null
  )
  readonly steps = computed(() => {
    if (this.expandSteps()) {
      return this.#steps()
    } else {
      return [this.lastStep()]
    }
  })
  readonly expandReason = signal(false)
  readonly expandSteps = signal(false)

  readonly conversationStatus = computed(() => this.conversation()?.status)

  constructor() {
    effect(() => {
      // console.log(this.message())
    })
  }

  toggleSteps() {
    this.expandSteps.update((state) => !state)
  }
}
