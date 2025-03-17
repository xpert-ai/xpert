import { A11yModule } from '@angular/cdk/a11y'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, model, output } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatSliderModule } from '@angular/material/slider'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { ChatHomeService } from '../home.service'
import { ChatMessageStepType } from '../../../@core'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    DragDropModule,
    CdkMenuModule,
    CdkListboxModule,
    A11yModule,
    RouterModule,
    TranslateModule,
    MatSliderModule,
    MatTooltipModule
  ],
  selector: 'pac-chat-canvas',
  templateUrl: './canvas.component.html',
  styleUrl: 'canvas.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatCanvasComponent {
  eChatMessageStepType = ChatMessageStepType

  readonly homeService = inject(ChatHomeService)

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
  readonly plan = computed(() => this.steps()?.find((_) => _.type === ChatMessageStepType.ComputerUse && _.tool === 'create_plan')?.data)

  // Outputs
  readonly closed = output()

  constructor() {
    // Update to last step
    effect(() => {
      if (this.steps()) {
        this.updateStepIndex(this.steps().length - 1)
      }
    }, { allowSignalWrites: true})
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
}
