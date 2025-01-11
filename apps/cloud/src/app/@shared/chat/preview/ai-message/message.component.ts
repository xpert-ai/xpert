import { CommonModule } from '@angular/common'
import { Component, computed, effect, input } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { IChatMessage } from 'apps/cloud/src/app/@core'
import { MarkdownModule } from 'ngx-markdown'

@Component({
  standalone: true,
  imports: [CommonModule, TranslateModule, MarkdownModule],
  selector: 'xpert-preview-ai-message',
  templateUrl: 'message.component.html',
  styleUrls: ['message.component.scss']
})
export class XpertPreviewAiMessageComponent {
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

  constructor() {
    effect(() => {
      // console.log(this.message())
    })
  }
}
