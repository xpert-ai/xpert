import { Dialog } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { ChatMessageStepIconComponent } from '@cloud/app/@shared/chat'
import { NgmDSCoreService, RelativeTimesPipe } from '@metad/ocap-angular/core'
import { SlicersCapacity } from '@metad/ocap-angular/selection'
import { TimeGranularity } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import {
  ChatMessageStepCategory,
  ChatMessageStepType,
  IXpertTask,
  TMessageComponent,
  TMessageComponentStep,
  TMessageContentComponent
} from '../../@core'
import { XpertHomeService } from '../home.service'
import { ChatComponentMessageFilesComponent } from './files/files.component'
import { ChatComponentMessageIframeComponent } from './iframe/iframe.component'
import { ChatComponentMemoriesComponent } from './memories/memories.component'
import { ChatComponentScheduleTasksComponent } from './schedule-tasks/tasks.component'
import { ChatComponentMessageTasksComponent } from './tasks/tasks.component'
import { ChatService } from '../chat.service'

/**
 * A component that uniformly displays different types of component messages.
 * Currently has two categories: `Computer` and others
 *
 */
@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    DragDropModule,
    CdkMenuModule,
    RouterModule,
    TranslateModule,
    MatTooltipModule,

    ChatComponentMessageTasksComponent,
    ChatComponentScheduleTasksComponent,
    ChatComponentMemoriesComponent,
    ChatComponentMessageFilesComponent,
    ChatComponentMessageIframeComponent,
    ChatMessageStepIconComponent,
    RelativeTimesPipe
  ],
  selector: 'chat-component-message',
  templateUrl: './component-message.component.html',
  styleUrl: 'component-message.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatComponentMessageComponent {
  eSlicersCapacity = SlicersCapacity
  eTimeGranularity = TimeGranularity
  eChatMessageStepCategory = ChatMessageStepCategory
  eChatMessageStepType = ChatMessageStepType

  readonly #dialog = inject(Dialog)
  readonly dsCore = inject(NgmDSCoreService)
  readonly homeService = inject(XpertHomeService)
  readonly chatService = inject(ChatService)

  // Inputs
  // Message ID
  readonly messageId = input<string>()
  // Sub component message
  readonly message = input<TMessageContentComponent>()

  // States
  readonly data = computed(() => this.message()?.data as TMessageComponent<{ data?: any }>)

  readonly tasks = computed(() => (<TMessageComponent<{ tasks: IXpertTask[] }>>this.data())?.tasks)
  readonly step = computed(() => <TMessageComponent<TMessageComponentStep>>this.data())
  readonly duration = computed(() => {
    const start = this.step()?.created_date ? new Date(this.step()?.created_date) : new Date()
    const end = this.step()?.end_date ? new Date(this.step()?.end_date) : new Date()
    return (end.getTime() - start.getTime()) / 1000
  })
  readonly conversationStatus = computed(() => this.chatService.conversation()?.status)

  // constructor() {
  //   effect(
  //     () => {
  //       console.log(this.step())
  //     },
  //   )
  // }

  openInCanvas(data: TMessageComponent) {
    this.homeService.canvasOpened.set({
      opened: true,
      type: 'Computer',
      componentId: this.message()?.id
    })
  }
}
