import { Component, computed, effect, input, signal } from '@angular/core'
import { StoredMessage } from '@langchain/core/messages'
import { TranslateModule } from '@ngx-translate/core'
import { MarkdownModule } from 'ngx-markdown'
import { Copy2Component, CopyComponent } from '../../common'
import { CopilotMessageContentComponent } from '../message-content/content.component'
import { CopilotMessageToolCallComponent } from '../tool-call/tool-call.component'
import { ZardIconComponent, ZardTooltipImports } from '@xpert-ai/headless-ui'
@Component({
  standalone: true,
  imports: [
    TranslateModule,
    ...ZardTooltipImports,
    MarkdownModule,
    CopyComponent,
    Copy2Component,
    CopilotMessageContentComponent,
    CopilotMessageToolCallComponent,
    ZardIconComponent
  ],
  selector: 'copilot-stored-message',
  templateUrl: 'message.component.html',
  styleUrls: ['message.component.scss']
})
export class CopilotStoredMessageComponent {
  // Inputs
  readonly message = input<StoredMessage>()

  // States
  readonly content = computed(() => this.message()?.data.content)

  readonly toolCalls = computed(() => (<any>this.message()?.data).tool_calls)
  readonly responseMetadata = computed(() => {
    const message = this.message()
    if (message?.type !== 'ai') {
      return null
    }

    const metadata = message.data.response_metadata
    return metadata && Object.keys(metadata).length ? metadata : null
  })
  readonly responseMetadataText = computed(() => {
    const metadata = this.responseMetadata()
    return metadata ? JSON.stringify(metadata, null, 2) : ''
  })

  readonly toolMessage = computed(() => this.message()?.data)
  readonly toolResponse = computed(() => {
    const content = this.toolMessage()?.content
    return content
  })

  readonly reasoning = computed(() => this.message()?.data?.additional_kwargs?.reasoning_content)
  readonly text = computed(() => {
    let text = this.content()
      ? typeof this.content() === 'string'
        ? this.content()
        : JSON.stringify(this.content())
      : ''

    if (this.toolCalls()) {
      text += text ? '\n\n' : ''
      text += JSON.stringify(this.toolCalls(), null, 2)
    }

    return text
  })

  readonly expandReason = signal(false)

  constructor() {
    effect(() => {
      // console.log(this.message())
    })
  }
}
