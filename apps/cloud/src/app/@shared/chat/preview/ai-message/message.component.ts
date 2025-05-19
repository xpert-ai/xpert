import { CommonModule } from '@angular/common'
import { Component, computed, effect, input, signal } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ListHeightStaggerAnimation } from '@metad/core'
import { TranslateModule } from '@ngx-translate/core'
import { ChatMessageStepType, DateRelativePipe, IChatMessage } from 'apps/cloud/src/app/@core'
import { NgxJsonViewerModule } from 'ngx-json-viewer'
import { MarkdownModule } from 'ngx-markdown'
import { Copy2Component } from '../../../common'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    MatTooltipModule,
    MarkdownModule,
    DateRelativePipe,
    Copy2Component,
    NgxJsonViewerModule
  ],
  selector: 'xpert-preview-ai-message',
  templateUrl: 'message.component.html',
  styleUrls: ['message.component.scss'],
  animations: [ListHeightStaggerAnimation]
})
export class XpertPreviewAiMessageComponent {
  eChatMessageStepType = ChatMessageStepType

  readonly message = input<IChatMessage>()

  readonly contents = computed(() => {
    if (typeof this.message()?.content === 'string') {
      return [
        {
          type: 'text',
          text: this.message().content
        }
      ]
    } else if (Array.isArray(this.message()?.content)) {
      return this.message().content as any[]
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
  readonly #steps = computed(() => this.message().steps)
  readonly lastStep = computed(() =>
    this.message().steps ? this.message().steps[this.message().steps.length - 1] : null
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

  constructor() {
    effect(() => {
      // console.log(this.message())
    })
  }

  toggleSteps() {
    this.expandSteps.update((state) => !state)
  }
}
