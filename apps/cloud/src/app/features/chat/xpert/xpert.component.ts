import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, ViewContainerRef } from '@angular/core'
import { RouterModule } from '@angular/router'
import { ChatService, XpertChatAppComponent } from '@cloud/app/xpert'
import { TranslateModule } from '@ngx-translate/core'
import { ChatPlatformService } from '../chat.service'
import { ChatXpertsComponent } from '../xperts/xperts.component'
import { ChatHomeService } from '../home.service'
import { IXpert } from '@cloud/app/@core'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar'
import { Dialog } from '@angular/cdk/dialog'
import { ChatConversationsComponent } from '@cloud/app/xpert'

/**
 */
@Component({
  standalone: true,
  imports: [CommonModule, RouterModule, CdkMenuModule, TranslateModule, EmojiAvatarComponent, XpertChatAppComponent, ChatXpertsComponent],
  selector: 'pac-chat-xpert',
  templateUrl: './xpert.component.html',
  styleUrl: 'xpert.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [],
  providers: [ChatPlatformService, { provide: ChatService, useExisting: ChatPlatformService }]
})
export class ChatXpertComponent {
  readonly chatService = inject(ChatPlatformService)
  readonly homeService = inject(ChatHomeService)
  readonly #dialog = inject(Dialog)
  readonly #vcr = inject(ViewContainerRef)

  readonly xpert = this.chatService.xpert
  readonly xperts = this.homeService.sortedXperts

  newConv() {
    this.chatService.newConv()
  }

  newXpertConv(xpert?: IXpert) {
    this.chatService.newConv(xpert?.slug)
  }

  openConversations() {
    this.#dialog
      .open(ChatConversationsComponent, {
        viewContainerRef: this.#vcr,
        data: {
          basePath: '/chat/'
        }
      })
      .closed.subscribe({
        next: () => {}
      })
  }
}
