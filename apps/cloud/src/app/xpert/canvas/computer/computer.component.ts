import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Dialog } from '@angular/cdk/dialog'
import { ChangeDetectionStrategy, Component, computed, effect, inject, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatSliderModule } from '@angular/material/slider'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { FileTypePipe, ListHeightStaggerAnimation } from '@metad/core'
import { TranslateModule } from '@ngx-translate/core'
import { derivedAsync } from 'ngxtension/derived-async'
import { ChatConversationFilesComponent } from '@cloud/app/@shared/chat'
import { ChatConversationService, ChatMessageStepCategory, ChatMessageStepType, injectFormatRelative } from '@cloud/app/@core'
import { FileEditorComponent } from '@cloud/app/@shared/files'
import { XpertProjectTasksComponent } from '@cloud/app/@shared/xpert'
import { CanvasHtmlEditorComponent } from '../html-editor/html-editor.component'
import { BehaviorSubject, debounceTime, switchMap } from 'rxjs'
import { XpertHomeService } from '../../home.service'
import { ChatService } from '../../chat.service'
import { ChatCanvasIframeComponent } from '../iframe/iframe.component'
import { ChatCanvasTerminalComponent } from '../terminal/terminal.component'
import { ChatCanvasFileEditorComponent } from '../file-editor/file-editor.component'


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
    ChatCanvasFileEditorComponent
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
  eChatMessageStepType = ChatMessageStepType
  eChatMessageStepCategory = ChatMessageStepCategory

  readonly homeService = inject(XpertHomeService)
  readonly chatService = inject(ChatService)
  readonly conversationService = inject(ChatConversationService)
  readonly #dialog = inject(Dialog)
  readonly #formatRelative = injectFormatRelative()

  // States
  readonly expand = signal(false)
  // readonly messageId = computed(() => this.homeService.canvasOpened()?.type === 'Computer' && this.homeService.canvasOpened()?.messageId)
  // Collect steps from messages
  readonly steps = computed(() => {
    const conversation = this.chatService.conversation()
    return conversation?.messages?.reduce((acc, message) => {
      if (message.steps && message.steps.length > 0) {
        acc.push(...message.steps)
      }
      return acc
    }, [])
  })

  readonly stepLength = computed(() => this.steps()?.length)
  readonly stepIndex = model<number>(0)
  readonly step = computed(() => this.steps()?.[this.stepIndex()])

  // Plan
  readonly hasPlan = computed(
    () => this.steps()?.some((_) => _.type === ChatMessageStepType.ComputerUse && ['create_plan', 'update_plan_step'].includes(_.tool))
  )
  readonly conversationId = this.homeService.conversationId
  readonly #refreshState$ = new BehaviorSubject<void>(null)
  readonly state = derivedAsync(() => {
    const id = this.conversationId()
    return id && this.hasPlan() ? this.#refreshState$.pipe(
      debounceTime(300),
      switchMap(() => this.conversationService.getThreadState(id))) : null
  })

  readonly plan = computed(() => {
    const state = this.state()
    return state ? {
      title: state.plan_title, 
      steps: state.plan_steps,
      status: state.plan_steps?.some((_) => _.status === 'in_progress') ? 'in_progress' :
        state.plan_steps?.every((_) => _.status === 'completed') ? 'completed' : null,
      total: state.plan_steps?.length,
      completed: state.plan_steps?.filter((_) => _.status === 'completed')?.length
    } : null
  })

  readonly expandPlan = signal(false)

  readonly projectId = computed(() => this.chatService.project()?.id)

  constructor() {
    effect(() => {
      // console.log(this.state())
    })
    // Update to last step
    effect(
      () => {
        if (this.steps()) {
          this.updateStepIndex(this.steps().length - 1)
          this.#refreshState$.next()
        }
      },
      { allowSignalWrites: true }
    )
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

  _formatStepLabel(value: number): string {
    const step = this.steps()?.[value]
    return step ? this.#formatRelative(step.created_date) : `${value}`
  }

  formatStepLabel = this._formatStepLabel.bind(this)

  close() {
    this.homeService.canvasOpened.set(null)
  }
  
  togglePlan() {
    this.expandPlan.update((state) => !state)
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
