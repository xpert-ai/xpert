import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { DateRelativePipe } from '@cloud/app/@core'
import { TMessageContentComplex } from '@cloud/app/@core/types'
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

  onCopy(copyButton) {
    copyButton.copied = true
    setTimeout(() => {
      copyButton.copied = false
    }, 3000)
  }
}
