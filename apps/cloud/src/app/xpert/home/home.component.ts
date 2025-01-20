import { A11yModule } from '@angular/cdk/a11y'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { effectAction, provideOcapCore } from '@metad/ocap-angular/core'
import { WaIntersectionObserver } from '@ng-web-apis/intersection-observer'
import { TranslateModule } from '@ngx-translate/core'
import { provideMarkdown } from 'ngx-markdown'
import { switchMap, tap } from 'rxjs/operators'
import { ChatConversationService, OrderTypeEnum, routeAnimations, XpertService, injectToastr, getErrorMessage, IChatConversation } from '../../@core'
import { EmojiAvatarComponent } from '../../@shared/avatar/'
import { ChatAppService } from '../chat-app.service'
import { ChatInputComponent } from '../chat-input/chat-input.component'
import { ChatService, groupConversations } from '../chat.service'
import { ChatConversationComponent } from '../conversation/conversation.component'
import { MatInputModule } from '@angular/material/input'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    DragDropModule,
    CdkListboxModule,
    CdkMenuModule,
    A11yModule,
    RouterModule,
    TranslateModule,
    WaIntersectionObserver,
    MatTooltipModule,
    MatInputModule,
    EmojiAvatarComponent,
    NgmSpinComponent,

    ChatInputComponent,
    ChatConversationComponent
  ],
  selector: 'chat-home',
  templateUrl: './home.component.html',
  styleUrl: 'home.component.scss',
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideMarkdown({}),
    provideOcapCore(),
    ChatAppService,
    { provide: ChatService, useExisting: ChatAppService }
  ]
})
export class ChatHomeComponent {
  readonly chatService = inject(ChatService)
  readonly conversationService = inject(ChatConversationService)
  readonly xpertService = inject(XpertService)
  readonly #toastr = injectToastr()

  readonly xpert = this.chatService.xpert
  readonly conversationId = this.chatService.conversationId

  readonly avatar = computed(() => this.xpert()?.avatar)

  readonly conversations = signal<IChatConversation[]>([])
  readonly groups = computed(() => {
    const conversations = this.conversations()
    return groupConversations(conversations)
  })

  readonly loading = signal(false)
  readonly pageSize = 20
  readonly currentPage = signal(0)
  readonly done = signal(false)

  readonly editingConversation = signal<string>(null)
  readonly editingTitle = signal<string>(null)

  constructor() {
    effect(() => {
      const conv = this.chatService.conversation()
      if (conv?.id) {
        this.conversations.update((items) => {
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

  loadConversations = effectAction((origin$) => {
    return origin$.pipe(
      switchMap(() => {
        this.loading.set(true)
        return this.xpertService.getAppConversations(this.xpert().slug, {
          select: ['id', 'threadId', 'title', 'updatedAt', 'from'],
          order: { updatedAt: OrderTypeEnum.DESC },
          take: this.pageSize,
          skip: this.currentPage() * this.pageSize,
          where: {
            from: 'webapp'
          }
        })
      }),
      tap({
        next: ({ items, total }) => {
          this.conversations.update((state) => [...state, ...items])
          this.currentPage.update((state) => ++state)
          if (items.length < this.pageSize || this.currentPage() * this.pageSize >= total) {
            this.done.set(true)
          }
          this.loading.set(false)
        },
        error: (err) => {
          this.loading.set(false)
        }
      })
    )
  })

  onIntersection() {
    if (!this.loading() && !this.done()) {
      this.loadConversations()
    }
  }

  selectConversation(item: IChatConversation) {
    this.chatService.setConversation(item.id)
  }

  deleteConv(id: string) {
    this.xpertService.deleteAppConversation(this.xpert().slug, id).subscribe({
      next: () => {
        this.conversations.update((items) => items.filter((item) => item.id !== id))
      },
      error: (err) => {
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  async newConversation() {
    await this.chatService.newConversation()
  }

  updateTitle(conv: IChatConversation) {
    this.xpertService.updateAppConversation(
      this.xpert().slug,
      this.editingConversation(),
      { title: this.editingTitle() }).subscribe({
      next: () => {
        conv.title = this.editingTitle()
        this.editingConversation.set(null)
        this.editingTitle.set('')
      }
    })
  }
}
