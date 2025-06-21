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
  ChatMessageStepType,
  injectFormatRelative
} from '@cloud/app/@core'
import { ChatConversationFilesComponent } from '@cloud/app/@shared/chat'
import { FileEditorComponent } from '@cloud/app/@shared/files'
import { XpertProjectTasksComponent } from '@cloud/app/@shared/xpert'
import { FileTypePipe, ListHeightStaggerAnimation } from '@metad/core'
import { TranslateModule } from '@ngx-translate/core'
import { uniq } from 'lodash-es'
import { derivedAsync } from 'ngxtension/derived-async'
import { BehaviorSubject, debounceTime, switchMap } from 'rxjs'
import { ChatService } from '../../chat.service'
import { XpertHomeService } from '../../home.service'
import { ChatCanvasFileEditorComponent } from '../file-editor/file-editor.component'
import { CanvasHtmlEditorComponent } from '../html-editor/html-editor.component'
import { ChatCanvasIframeComponent } from '../iframe/iframe.component'
import { ChatCanvasTerminalComponent } from '../terminal/terminal.component'

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

  // Inputs
  readonly componentId = input<string>()

  // States
  readonly expand = signal(false)
  readonly pin = signal(false)

  /**
   * Collect steps from messages
   * @deprecated use `stepMessages` instead
   */
  readonly steps = computed(() => {
    const conversation = this.chatService.conversation()
    return conversation?.messages?.reduce((acc, message) => {
      if (message.steps && message.steps.length > 0) {
        acc.push(...message.steps)
      }
      return acc
    }, [])
  })

  readonly stepMessages = computed(() => {
    const conversation = this.chatService.conversation()
    return conversation?.messages?.reduce((acc, message) => {
      if (Array.isArray(message.content) && message.content.length > 0) {
        acc.push(...message.content.filter((_) => _.type === 'component'))
      }
      return acc
    }, [])
  })
  readonly stepCategories = computed(() => uniq(this.stepMessages().map((_) => _.category)))
  readonly stepTypes = computed(() => uniq(this.stepMessages().map((_) => _.type)))

  /**
   * @deprecated use `stepMessages` instead
   */
  readonly stepLength = computed(() => this.steps()?.length)
  readonly stepIndex = model<number>(0)
  /**
   * @deprecated use `stepMessages` instead
   */
  readonly step = computed(() => this.steps()?.[this.stepIndex()])
  readonly stepMessage = computed(() => this.stepMessages()?.[this.stepIndex()]?.data)
  readonly stepMessageLength = computed(() => this.stepMessages()?.length)

  // Plan
  readonly hasPlan = computed(() =>
    this.steps()?.some(
      (_) => _.type === ChatMessageStepType.ComputerUse && ['create_plan', 'update_plan_step'].includes(_.tool)
    )
  )
  readonly conversationId = this.homeService.conversationId
  /**
   * @deprecated
   */
  readonly #refreshState$ = new BehaviorSubject<void>(null)
  /**
   * @deprecated
   */
  readonly state = derivedAsync(() => {
    const id = this.conversationId()
    return id && this.hasPlan()
      ? this.#refreshState$.pipe(
          debounceTime(300),
          switchMap(() => this.conversationService.getThreadState(id))
        )
      : null
  })

  /**
   * @deprecated
   */
  readonly plan = computed(() => {
    const state = this.state()
    return state
      ? {
          title: state.plan_title,
          steps: state.plan_steps,
          status: state.plan_steps?.some((_) => _.status === 'in_progress')
            ? 'in_progress'
            : state.plan_steps?.every((_) => _.status === 'completed')
              ? 'completed'
              : null,
          total: state.plan_steps?.length,
          completed: state.plan_steps?.filter((_) => _.status === 'completed')?.length
        }
      : null
  })
  /**
   * @deprecated
   */
  readonly expandPlan = signal(false)

  readonly projectId = computed(() => this.chatService.project()?.id)

  constructor() {
    // effect(() => {
    //   console.log(this.stepMessages(), this.stepTypes(), this.stepCategories())
    // })

    effect(() => {
      // If componentId is provided, find the step message by componentId
      if (this.componentId()) {
        const stepMessage = this.stepMessages()?.find((msg) => msg.id === this.componentId())
        if (stepMessage) {
          const index = this.stepMessages().indexOf(stepMessage)
          this.stepIndex.set(index)
          this.#refreshState$.next()
        }
      }
    }, { allowSignalWrites: true })

    // Update to last step
    effect(
      () => {
        if (this.steps()?.length) {
          this.updateStepIndex(this.steps().length - 1)
          this.#refreshState$.next()
        }
      },
      { allowSignalWrites: true }
    )
    
    effect(
      () => {
        if (this.stepMessages() && !this.pin()) {
          this.stepIndex.set(this.stepMessages().length - 1)
          this.#refreshState$.next()
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

  _formatStepLabel(value: number): string {
    const step = this.steps()?.[value]
    return step ? this.#formatRelative(step.created_date) : `${value}`
  }

  formatStepLabel = this._formatStepLabel.bind(this)

  close() {
    this.homeService.canvasOpened.update((state) => ({ ...state, opened: false }))
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
