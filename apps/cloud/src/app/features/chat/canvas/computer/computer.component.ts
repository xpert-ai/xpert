import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, model, output } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatSliderModule } from '@angular/material/slider'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { ChatMessageStepType, injectFormatRelative } from '../../../../@core'
import { FileEditorComponent } from '../../../../@shared/files'
import { ChatHomeService } from '../../home.service'
import { CanvasHtmlEditorComponent } from '../html-editor/html-editor.component'

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
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatCanvasComputerComponent {
  eChatMessageStepType = ChatMessageStepType

  readonly homeService = inject(ChatHomeService)
  readonly #formatRelative = injectFormatRelative()

  // States
  readonly messageId = this.homeService.canvasOpened
  readonly steps = computed(() => {
    const conversation = this.homeService.conversation()
    const id = this.messageId()
    if (conversation?.messages && id) {
      return conversation.messages.find((_) => _.id === id)?.steps
    }
    return []
  })

  readonly stepLength = computed(() => this.steps()?.length)
  readonly stepIndex = model<number>(0)
  readonly step = computed(() => this.steps()?.[this.stepIndex()])
  readonly plan = computed(
    () => this.steps()?.find((_) => _.type === ChatMessageStepType.ComputerUse && _.tool === 'create_plan')?.data
  )

  constructor() {
    effect(() => {
      // console.log(this.step())
    })
    // Update to last step
    effect(
      () => {
        if (this.steps()) {
          this.updateStepIndex(this.steps().length - 1)
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
}
