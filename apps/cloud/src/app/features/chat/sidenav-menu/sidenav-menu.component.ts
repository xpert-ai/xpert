import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatSidenav } from '@angular/material/sidenav'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { MaterialModule } from '../../../@shared/material.module'
import { ChatNewChatComponent, ChatSideMenuComponent } from '../icons'
import { ChatService } from '../../../xpert/'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    MaterialModule,
    NgmCommonModule,
    ChatSideMenuComponent,
    ChatNewChatComponent
  ],
  selector: 'pac-chat-sidenav-menu',
  templateUrl: './sidenav-menu.component.html',
  styleUrl: 'sidenav-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatSidenavMenuComponent {
  readonly chatService = inject(ChatService)
  
  readonly sidenav = input<MatSidenav>()

  async newConversation() {
    await this.chatService.newConversation()
  }
}
