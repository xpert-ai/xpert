import { CommonModule } from '@angular/common'
import { Component, computed, effect, input } from '@angular/core'
import { TMessageContent, TMessageContentComplex } from '@cloud/app/@core/types'
import { MarkdownModule } from 'ngx-markdown'

@Component({
  standalone: true,
  imports: [CommonModule, MarkdownModule,],
  selector: 'copilot-message-content',
  templateUrl: 'content.component.html',
  styleUrls: ['content.component.scss']
})
export class CopilotMessageContentComponent {
  readonly content = input<TMessageContent>()

  readonly contents = computed(() => {
    const content = this.content()
    const items: TMessageContentComplex[] = []
    if (typeof content === 'string') {
      items.push({
        text: content,
        type: 'text'
      })
    } else if (Array.isArray(content)) {
      items.push(...content)
    }
    return items
  })

  constructor() {
    effect(() => {
      // console.log(this.contents())
    })
  }
}
