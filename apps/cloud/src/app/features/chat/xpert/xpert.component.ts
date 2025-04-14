import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, ViewContainerRef } from '@angular/core'
import { RouterModule } from '@angular/router'
import { ChatService, XpertChatAppComponent, XpertOcapService } from '@cloud/app/xpert'
import { TranslateModule } from '@ngx-translate/core'
import { ChatPlatformService } from '../chat.service'
import { ChatXpertsComponent } from '../xperts/xperts.component'
import { ChatHomeService } from '../home.service'
import { IXpert } from '@cloud/app/@core'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar'
import { Dialog } from '@angular/cdk/dialog'
import { ChatConversationsComponent } from '@cloud/app/xpert'
import { provideOcapCore } from '@metad/ocap-angular/core'
import { provideOcap } from '@cloud/app/@core/providers/ocap'

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
  providers: [
    ChatPlatformService, 
    { provide: ChatService, useExisting: ChatPlatformService },
    provideOcapCore(),
    provideOcap(),
    XpertOcapService
  ]
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
    this.chatService.newConv(xpert)
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
