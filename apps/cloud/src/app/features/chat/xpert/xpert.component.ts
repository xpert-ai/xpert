import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { injectXpertPreferences, Store } from '@metad/cloud/state'
import { TranslateModule } from '@ngx-translate/core'
import { NgxPermissionsService } from 'ngx-permissions'
import { map } from 'rxjs'
import { AIPermissionsEnum, IXpert } from '../../../@core'
import { EmojiAvatarComponent } from '../../../@shared/avatar'
import { ChatPlatformService } from '../chat.service'
import { ChatToolbarComponent } from '../toolbar/toolbar.component'
import { ChatSidenavMenuComponent } from '../sidenav-menu/sidenav-menu.component'
import { ChatConversationComponent, ChatInputComponent, ChatService } from '../../../xpert'
import { MatSidenav } from '@angular/material/sidenav'
import { ChatHomeComponent } from '../home.component'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    CdkListboxModule,
    DragDropModule,
    MatTooltipModule,
    EmojiAvatarComponent,
    ChatToolbarComponent,
    ChatSidenavMenuComponent,
    ChatConversationComponent,
    ChatInputComponent,
  ],
  selector: 'pac-chat-xpert',
  templateUrl: './xpert.component.html',
  styleUrl: 'xpert.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatXpertComponent {
  readonly chatService = inject(ChatService)
  readonly chatHomeComponent = inject(ChatHomeComponent)
  
  readonly sidenav = this.chatHomeComponent.sidenav
 
  readonly conversationId = this.chatService.conversationId
  readonly messages = this.chatService.messages
  readonly role = this.chatService.xpert
}
