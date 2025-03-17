import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatSliderModule } from '@angular/material/slider'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { ChatMessageStepType, injectFormatRelative } from '../../../../@core'
import { ChatHomeService } from '../../home.service'
import { ChatComponentMessageComponent } from 'apps/cloud/src/app/xpert/'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    CdkMenuModule,
    RouterModule,
    TranslateModule,
    MatSliderModule,
    MatTooltipModule,
    ChatComponentMessageComponent
  ],
  selector: 'chat-canvas-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrl: 'dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatCanvasDashboardComponent {
  eChatMessageStepType = ChatMessageStepType

  readonly homeService = inject(ChatHomeService)
  readonly #formatRelative = injectFormatRelative()

  // States
  readonly messageId = computed(() => this.homeService.canvasOpened()?.type === 'Dashboard' && this.homeService.canvasOpened()?.messageId)

  readonly message = computed(() => {
    const conversation = this.homeService.conversation()
    const id = this.messageId()
    if (conversation?.messages && id) {
      return conversation.messages.find((_) => _.id === id)
    }
    return null
  })
  readonly contents = computed(() => {
    const contents = this.message()?.content
    if (Array.isArray(contents)) {
      return contents
    }
    return null
  })

  constructor() {
    effect(() => {
      console.log(this.messageId(), this.message(), this.contents())
    })
  }

  close() {
    this.homeService.canvasOpened.set(null)
  }
}
