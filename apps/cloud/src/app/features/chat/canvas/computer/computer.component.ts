import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, model, output, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatSliderModule } from '@angular/material/slider'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { ChatConversationService, ChatMessageStepType, injectFormatRelative } from '../../../../@core'
import { FileEditorComponent } from '../../../../@shared/files'
import { ChatHomeService } from '../../home.service'
import { CanvasHtmlEditorComponent } from '../html-editor/html-editor.component'
import { derivedAsync } from 'ngxtension/derived-async'
import { ListHeightStaggerAnimation } from '@metad/core'
import { BehaviorSubject, debounceTime, switchMap } from 'rxjs'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    CdkMenuModule,
    RouterModule,
    TranslateModule,
    MatSliderModule,
    MatTooltipModule,
    FileEditorComponent,
    CanvasHtmlEditorComponent
  ],
  selector: 'chat-canvas-computer',
  templateUrl: './computer.component.html',
  styleUrl: 'computer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [ListHeightStaggerAnimation]
})
export class ChatCanvasComputerComponent {
  eChatMessageStepType = ChatMessageStepType

  readonly homeService = inject(ChatHomeService)
  readonly conversationService = inject(ChatConversationService)
  readonly #formatRelative = injectFormatRelative()

  // States
  readonly messageId = computed(() => this.homeService.canvasOpened()?.type === 'Computer' && this.homeService.canvasOpened()?.messageId)
  readonly steps = computed(() => {
    const conversation = this.homeService.conversation()
    const id = this.messageId()
    if (conversation?.messages) {
      return id ? conversation.messages.find((_) => _.id === id)?.steps : conversation.messages[conversation.messages.length - 1]?.steps
    }
    return []
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
}
