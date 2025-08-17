import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatSliderModule } from '@angular/material/slider'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import {
  ChatConversationService,
  ChatMessageStepCategory,
  injectFormatRelative,
  TChatConversationOptions
} from '@cloud/app/@core'
import { ChatConversationFilesComponent } from '@cloud/app/@shared/chat'
import { FileEditorComponent } from '@cloud/app/@shared/files'
import { XpertProjectTasksComponent } from '@cloud/app/@shared/xpert'
import { FileTypePipe, ListHeightStaggerAnimation } from '@metad/core'
import { TranslateModule } from '@ngx-translate/core'
import { uniq } from 'lodash-es'
import { ChatService } from '../../chat.service'
import { XpertHomeService } from '../../home.service'
import { ChatCanvasFileEditorComponent } from '../file-editor/file-editor.component'
import { CanvasHtmlEditorComponent } from '../html-editor/html-editor.component'
import { ChatCanvasIframeComponent } from '../iframe/iframe.component'
import { ChatCanvasTerminalComponent } from '../terminal/terminal.component'
import { ChatCanvasKnowledgesComponent } from '../knowledges/knowledges.component'
import { ChatCanvasWebTerminalComponent } from '../web-terminal/terminal.component'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    CdkMenuModule,
    TranslateModule,
    MatSliderModule,
    MatTooltipModule,
    FileTypePipe,
    FileEditorComponent,
    CanvasHtmlEditorComponent,
    XpertProjectTasksComponent,
    ChatCanvasIframeComponent,
    ChatCanvasTerminalComponent,
    ChatCanvasFileEditorComponent,
    ChatCanvasKnowledgesComponent,
    ChatCanvasWebTerminalComponent
  ],
  selector: 'chat-canvas-computer',
  templateUrl: './computer.component.html',
  styleUrl: 'computer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [ListHeightStaggerAnimation],
  host: {
    '[class.expand]': 'expand()'
  }
})
export class ChatCanvasComputerComponent {
  eChatMessageStepCategory = ChatMessageStepCategory

  readonly homeService = inject(XpertHomeService)
  readonly chatService = inject(ChatService)
  readonly conversationService = inject(ChatConversationService)
  readonly #dialog = inject(Dialog)
  readonly #formatRelative = injectFormatRelative()

  // Inputs
  readonly componentId = input<string>()

  // States
  readonly expand = signal(false)
  readonly pin = signal(false)

  readonly stepMessages = computed(() => {
    const conversation = this.chatService.conversation()
    return conversation?.messages?.reduce((acc, message) => {
      if (Array.isArray(message.content) && message.content.length > 0) {
        acc.push(...message.content.filter((_) => _.type === 'component' && _.data?.category === 'Computer'))
      }
      return acc
    }, []) ?? []
  })
  readonly stepCategories = computed(() => uniq(this.stepMessages().map((_) => _.category)))
  readonly stepTypes = computed(() => uniq(this.stepMessages().map((_) => _.type)))

  readonly stepIndex = model<number>(0)
  readonly stepMessage = computed(() => this.stepMessages()?.[this.stepIndex()]?.data)
  readonly stepMessageLength = computed(() => this.stepMessages()?.length)

  readonly conversationId = this.homeService.conversationId

  readonly projectId = computed(() => this.chatService.project()?.id)

  readonly features = computed(() => ['timeline' as TChatConversationOptions['features'][number], ...(this.chatService.conversation()?.options?.features ?? [])])
  readonly feature = signal<TChatConversationOptions['features'][number]>('timeline')

  constructor() {
    effect(() => {
      // If componentId is provided, find the step message by componentId
      if (this.componentId()) {
        const stepMessage = this.stepMessages()?.find((msg) => msg.id === this.componentId())
        if (stepMessage) {
          const index = this.stepMessages().indexOf(stepMessage)
          this.stepIndex.set(index)
        }
      }
    }, { allowSignalWrites: true })
    
    effect(
      () => {
        if (this.stepMessageLength() && !this.pin()) {
          this.stepIndex.set(this.stepMessageLength() - 1)
        }
      },
      { allowSignalWrites: true }
    )
  }

  togglePin() {
    this.pin.update((state) => !state)
  }

  updateStepIndex(index: number) {
    this.stepIndex.set(index)
  }

  prevStep() {
    this.stepIndex.update((state) => --state)
  }

  nextStep() {
    this.stepIndex.update((state) => ++state)
  }

  close() {
    this.homeService.canvasOpened.update((state) => ({ ...state, opened: false }))
  }

  toggleExpand() {
    this.expand.update((state) => !state)
  }

  openFiles() {
    this.#dialog.open(ChatConversationFilesComponent, {
      data: {
        projectId: this.projectId(),
        conversationId: this.homeService.conversation().id
      }
    })
  }
}
