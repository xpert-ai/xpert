import { Dialog } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  inject,
  model,
  signal,
  ViewContainerRef
} from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { Router, RouterModule } from '@angular/router'
import { DisappearBL, SlideUpDownAnimation } from '@metad/core'
import { isNil } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { derivedAsync } from 'ngxtension/derived-async'
import { injectParams } from 'ngxtension/inject-params'
import { EmojiAvatarComponent } from '../../../@shared/avatar'
import { XpertParametersCardComponent } from '../../../@shared/xpert'
import { ChatConversationComponent, ChatService, XpertOcapService } from '../../../xpert'
import { ChatCanvasComponent } from '../canvas/canvas.component'
import { ChatInputComponent } from '../chat-input/chat-input.component'
import { ChatPlatformService } from '../chat.service'
import { ChatConversationsComponent } from '../conversations/conversations.component'
import { ChatHomeService } from '../home.service'
import { ChatHomeComponent } from '../home/home.component'
import { ChatXpertsComponent } from '../xperts/xperts.component'
import { provideOcapCore } from '@metad/ocap-angular/core'
import { IXpert } from '@metad/contracts'
import { Store } from '@metad/cloud/state'
import { toSignal } from '@angular/core/rxjs-interop'
import { UserPipe } from '../../../@shared/pipes'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    CdkListboxModule,
    CdkMenuModule,
    DragDropModule,
    MatTooltipModule,
    EmojiAvatarComponent,
    XpertParametersCardComponent,
    ChatConversationComponent,
    ChatInputComponent,
    ChatXpertsComponent,
    ChatCanvasComponent,
    UserPipe
  ],
  selector: 'pac-chat-xpert',
  templateUrl: './xpert.component.html',
  styleUrl: 'xpert.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [DisappearBL, SlideUpDownAnimation],
  providers: [
    ChatPlatformService, 
    { provide: ChatService, useExisting: ChatPlatformService },
    provideOcapCore(),
    XpertOcapService
  ]
})
export class ChatXpertComponent {
  readonly #store = inject(Store)
  readonly chatService = inject(ChatService)
  readonly homeService = inject(ChatHomeService)
  readonly chatHomeComponent = inject(ChatHomeComponent)
  readonly #router = inject(Router)
  readonly #dialog = inject(Dialog)
  readonly #vcr = inject(ViewContainerRef)
  readonly #elementRef = inject(ElementRef)

  readonly paramRole = injectParams('role')
  readonly paramConvId = injectParams('id')

  readonly userSignal = toSignal(this.#store.user$)
  readonly conversationId = this.chatService.conversationId
  readonly messages = this.chatService.messages

  readonly xpert = derivedAsync(() => {
    return this.paramRole() && this.paramRole() !== 'common' ? this.homeService.getXpert(this.paramRole()) : this.chatService.xpert()
  })

  readonly parameters = computed(() => this.xpert()?.agent?.parameters)
  readonly parametersValue = model<Record<string, unknown>>()

  readonly parameterInvalid = computed(() => {
    return this.parameters()?.some((param) => !param.optional && isNil(this.parametersValue()?.[param.name]))
  })

  readonly canvasOpened = this.homeService.canvasOpened
  readonly conversationTitle = this.homeService.conversationTitle

  readonly isBottom = signal(true)

  readonly xperts = this.homeService.sortedXperts

  readonly greeting = computed(() => {
    const now = new Date();
    const hours = now.getHours();
    let greeting = 'Good';

    if (hours >= 5 && hours < 12) {
      greeting = "Good morning";
    } else if (hours >= 12 && hours < 18) {
      greeting = "Good afternoon";
    } else if (hours >= 18 && hours < 22) {
      greeting = "Good evening";
    }

    return greeting;
  })

  constructor() {
    effect(
      () => {
        this.chatService.xpert$.next(this.xpert())
      },
      { allowSignalWrites: true }
    )

    effect(
      () => {
        this.homeService.xpert.set(this.xpert())
      },
      { allowSignalWrites: true }
    )

    effect(() => this.chatService.conversationId.set(this.paramConvId()), { allowSignalWrites: true })

    effect(
      () => {
        if (this.parametersValue()) {
          this.chatService.parametersValue.set(this.parametersValue())
        }
      },
      { allowSignalWrites: true }
    )

    effect(
      () => {
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
              return [{ ...conv }, ...items]
            }
          })
        }
      },
      { allowSignalWrites: true }
    )

    effect(() => {
      if (this.messages()) {
        this.scrollBottom()
      }
    })

    this.#elementRef.nativeElement.addEventListener('scroll', (event: Event) => {
      this.onScroll(event)
    })
  }

  newConv() {
    this.conversationId.set(null)
    this.chatService.xpert$.next(null)
    this.#router.navigate(['/chat/'])
  }

  newXpertConv(xpert?: IXpert) {
    xpert ??= this.xpert()
    if (xpert) {
      this.#router.navigate(['/chat/x/', xpert.slug])
    } else {
      this.#router.navigate(['/chat'])
    }
  }

  openConversations() {
    this.#dialog
      .open(ChatConversationsComponent, {
        viewContainerRef: this.#vcr
      })
      .closed.subscribe({
        next: () => {}
      })
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

  onScroll(event: Event) {
    // Handle the scroll event
    const container = this.#elementRef.nativeElement
    this.isBottom.set(container.scrollTop + container.clientHeight >= container.scrollHeight - 10)
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
      event.preventDefault(); // Prevent the default action
      this.openConversations(); // Execute the openConversations method
    } else if ((event.metaKey || event.ctrlKey) && event.key === 'j') {
      event.preventDefault(); // Prevent the default action
      this.newXpertConv(); // Execute the newXpertConv method
    }
  }

}
