import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  input,
  signal,
  viewChild
} from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { TMessageContentComplex, TMessageContentReasoning } from '@cloud/app/@core/types'
import { CopyComponent } from '@cloud/app/@shared/common'
import { TranslateModule } from '@ngx-translate/core'
import { MarkdownModule } from 'ngx-markdown'
import { TCopilotChatMessage } from '../types'
import { listEnterAnimation } from '@metad/core'

@Component({
  standalone: true,
  imports: [CommonModule, TranslateModule, MarkdownModule, MatTooltipModule, CopyComponent],
  selector: 'chat-thought',
  templateUrl: './thought.component.html',
  styleUrl: 'thought.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [ listEnterAnimation ]
})
export class ChatThoughtComponent {
  readonly message = input<TCopilotChatMessage>()
  readonly content = input<TMessageContentComplex>()

  // Reasoning
  readonly _content = computed(() => this.content() as TMessageContentReasoning)
  readonly reasoning = computed(() => this.expandReason() ? (this._content() ? [this._content()] : this.message().reasoning) : [])
  readonly expandReason = signal(true)

  readonly reasoningText = computed(() => (this._content() ? [this._content()] : this.message().reasoning)?.map(({text}) => text).join('\n\n'))

  readonly status = computed(() => this.message()?.status)

  readonly container = viewChild('container', { read: ElementRef })

  constructor() {
    effect(() => {
      const reasoning = this.reasoning()
      if (reasoning && this.status() === 'reasoning') {
        const containerElement = this.container()?.nativeElement
        if (containerElement) {
          containerElement.scrollTo({
            top: containerElement.scrollHeight,
            behavior: 'smooth'
          })
        }
      }
    })
  }

  onCopy(copyButton) {
    copyButton.copied = true
    setTimeout(() => {
      copyButton.copied = false
    }, 3000)
  }
}
