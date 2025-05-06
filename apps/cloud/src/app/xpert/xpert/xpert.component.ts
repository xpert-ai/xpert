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
  output,
  DestroyRef,
} from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { DisappearBL, IfAnimation, SlideUpDownAnimation } from '@metad/core'
import { isNil } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { derivedAsync } from 'ngxtension/derived-async'
import { injectParams } from 'ngxtension/inject-params'
import { EmojiAvatarComponent } from '../../@shared/avatar'
import { XpertParametersCardComponent } from '../../@shared/xpert'
import { ChatCanvasComponent } from '../canvas/canvas.component'
import { ChatInputComponent } from '../chat-input/chat-input.component'
import { IXpert, Store } from '@metad/cloud/state'
import { toSignal } from '@angular/core/rxjs-interop'
import { UserPipe } from '../../@shared/pipes'
import { ChatService } from '../chat.service'
import { XpertHomeService } from '../home.service'
import { ChatConversationComponent } from '../conversation/conversation.component'

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
    ChatInputComponent,
    ChatCanvasComponent,
    UserPipe,
    ChatConversationComponent
  ],
  selector: 'xpert-webapp',
  templateUrl: './xpert.component.html',
  styleUrl: 'xpert.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [IfAnimation, DisappearBL, SlideUpDownAnimation],
})
export class XpertChatAppComponent {
  readonly #store = inject(Store)
  readonly chatService = inject(ChatService)
  readonly homeService = inject(XpertHomeService)
  readonly #elementRef = inject(ElementRef)
  readonly #destroyRef = inject(DestroyRef)

  readonly paramRole = injectParams('name')
  readonly paramConvId = injectParams('id')

  // Outputs
  readonly openHistories = output()

  // States
  readonly userSignal = toSignal(this.#store.user$)
  readonly conversationId = this.chatService.conversationId
  readonly messages = this.chatService.messages

  readonly xpert = derivedAsync(() => {
    const slug = this.paramRole()
    return slug && slug !== 'common' ? this.homeService.getXpert(slug) : null
  })

  readonly parameters = computed(() => this.xpert()?.agent?.parameters)
  readonly parametersValue = model<Record<string, unknown>>()

  readonly parameterInvalid = computed(() => {
    return this.parameters()?.some((param) => !param.optional && isNil(this.parametersValue()?.[param.name]))
  })

  readonly canvasOpened = computed(() => this.homeService.canvasOpened()?.opened)
  readonly conversationTitle = this.homeService.conversationTitle

  readonly isBottom = signal(true)

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
        this.chatService.xpert.set(this.xpert())
      },
      { allowSignalWrites: true }
    )

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
      // Follow the latest news
      if (this.messages() && this.isBottom()) {
        this.scrollBottom()
      }
    })

    this.#destroyRef.onDestroy(() => {
      this.homeService.canvasOpened.set(null)
    })

    this.#elementRef.nativeElement.addEventListener('scroll', (event: Event) => {
      this.onScroll(event)
    })
  }

  newConv() {
    this.chatService.newConv()
  }

  newXpertConv(xpert?: IXpert) {
    xpert ??= this.xpert() ?? this.chatService.xpert()
    this.chatService.newConv(xpert)
  }

  openConversations() {
    this.openHistories.emit()
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
