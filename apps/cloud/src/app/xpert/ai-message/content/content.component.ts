import { CommonModule } from '@angular/common'
import { toObservable } from '@angular/core/rxjs-interop'
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { DateRelativePipe } from '@cloud/app/@core'
import { TMessageContentComplex, TMessageContentText } from '@cloud/app/@core/types'
import { Copy2Component } from '@cloud/app/@shared/common'
import { listEnterAnimation } from '@metad/core'
import { TranslateModule } from '@ngx-translate/core'
import { MarkdownModule } from 'ngx-markdown'
import { ChatService } from '../../chat.service'
import { ChatComponentMessageComponent } from '../../component-message'
import { TCopilotChatMessage } from '../../types'
import { ChatMessageDashboardComponent } from '../dashboard/dashboard.component'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    MarkdownModule,
    MatTooltipModule,
    DateRelativePipe,
    Copy2Component,
    ChatComponentMessageComponent,
    ChatMessageDashboardComponent
  ],
  selector: 'chat-message-content',
  templateUrl: './content.component.html',
  styleUrl: 'content.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [listEnterAnimation]
})
export class ChatMessageContentComponent {
  readonly chatService = inject(ChatService)

  readonly message = input<TCopilotChatMessage>()
  readonly content = input<TMessageContentComplex>()
  readonly last = input<boolean>()
  readonly collapse = input<boolean>()

  readonly submessage = computed(() => this.content())
  readonly text = computed(() => this.content()?.type === 'text' ? 
    (<TMessageContentText>this.content()).text : '')

  readonly status = computed(() => this.message()?.status)
  readonly answering = computed(() => this.chatService.answering() && ['thinking', 'answering'].includes(this.status()))
  private frozenText = ''
  readonly frozenBlocks = signal<string[]>([])
  readonly streaming = signal('')

  private textSubscription = toObservable(this.text).subscribe({
    next: (text) => {
      if (this.answering()) {
        const restText = text.startsWith(this.frozenText)
                          ? text.slice(this.frozenText.length)
                          : text
        const blocks = restText.split('\n\n')
        if (blocks.length > 1) {
          this.frozenBlocks.update((state) => [
            ...state,
            ...blocks.slice(0, -1)
          ])
          this.frozenText += blocks.slice(0, -1).join('\n\n')
          this.streaming.set(blocks[blocks.length - 1])
        } else {
          this.streaming.set(restText)
        }
      } else {
        this.frozenBlocks.set([text])
        this.frozenText = text
        this.streaming.set('')
      }
    }
  })


  onCopy(copyButton) {
    copyButton.copied = true
    setTimeout(() => {
      copyButton.copied = false
    }, 3000)
  }
}
