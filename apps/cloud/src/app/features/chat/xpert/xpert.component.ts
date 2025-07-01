import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { IXpert } from '@cloud/app/@core'
import { provideOcap } from '@cloud/app/@core/providers/ocap'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar'
import { ChatService, XpertChatAppComponent, XpertOcapService } from '@cloud/app/xpert'
import { provideOcapCore } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ChatPlatformService } from '../chat.service'
import { ChatHomeService } from '../home.service'
import { ChatXpertsComponent } from '../xperts/xperts.component'

/**
 */
@Component({
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    CdkMenuModule,
    TranslateModule,
    MatTooltipModule,
    EmojiAvatarComponent,
    XpertChatAppComponent,
    ChatXpertsComponent
  ],
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

  readonly xpert = this.chatService.xpert
  readonly xperts = this.homeService.sortedXperts

  newConv() {
    this.chatService.newConv()
  }

  newXpertConv(xpert?: IXpert) {
    this.chatService.newConv(xpert)
  }
}
