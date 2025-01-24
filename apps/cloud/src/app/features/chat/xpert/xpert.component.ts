import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, ElementRef, effect, inject } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { EmojiAvatarComponent } from '../../../@shared/avatar'
import { ChatConversationComponent, ChatInputComponent, ChatService } from '../../../xpert'
import { ChatPlatformService } from '../chat.service'
import { ChatHomeComponent } from '../home.component'
import { ChatSidenavMenuComponent } from '../sidenav-menu/sidenav-menu.component'
import { ChatToolbarComponent } from '../toolbar/toolbar.component'
import { ChatHomeService } from '../home.service'

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
    ChatInputComponent
  ],
  selector: 'pac-chat-xpert',
  templateUrl: './xpert.component.html',
  styleUrl: 'xpert.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ChatPlatformService, { provide: ChatService, useExisting: ChatPlatformService }]
})
export class ChatXpertComponent {
  readonly chatService = inject(ChatService)
  readonly homeService = inject(ChatHomeService)
  readonly chatHomeComponent = inject(ChatHomeComponent)
  readonly #elementRef = inject(ElementRef)

  readonly sidenavOpened = this.chatHomeComponent.sidenavOpened
  readonly sidenav = this.chatHomeComponent.sidenav

  readonly conversationId = this.chatService.conversationId
  readonly messages = this.chatService.messages
  readonly role = this.chatService.xpert

  constructor() {
    effect(() => {
      if (this.chatService.messages()) {
        this.scrollBottom()
      }
    })

    effect(() => {
      const conv = this.chatService.conversation()
      if (conv?.id) {
        this.homeService.conversations.update((items) => {
          const index = items.findIndex((_) => _.id === conv.id)
          if (index > -1) {
            items[index] = {
              ...items[index],
              ...conv
            }
            return [...items]
          } else {
            return  [{ ...conv}, ...items]
          }
        })
      }
    }, { allowSignalWrites: true })
  }

  scrollBottom(smooth = false) {
    setTimeout(() => {
      this.#elementRef.nativeElement.scrollTo({
        top: this.#elementRef.nativeElement.scrollHeight,
        left: 0,
        behavior: smooth ? 'smooth' : 'instant'
      })
    }, 100)
  }
}
