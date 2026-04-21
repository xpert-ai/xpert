import { Dialog } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { ChatContextCompressionChunkComponent, ChatToolCallChunkComponent } from '@cloud/app/@shared/chat'
import { NgmDSCoreService } from '@xpert-ai/ocap-angular/core'
import { SlicersCapacity } from '@xpert-ai/ocap-angular/selection'
import { TimeGranularity } from '@xpert-ai/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import {
  ChatMessageStepCategory,
  CONTEXT_COMPRESSION_COMPONENT_TYPE,
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
import { ZardTooltipImports } from '@xpert-ai/headless-ui'

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
    TranslateModule,
    ...ZardTooltipImports,

    ChatComponentMessageTasksComponent,
    ChatComponentScheduleTasksComponent,
    ChatComponentMemoriesComponent,
    ChatComponentMessageFilesComponent,
    ChatComponentMessageIframeComponent,
    ChatContextCompressionChunkComponent,
    ChatToolCallChunkComponent
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
  readonly contextCompressionComponentType = CONTEXT_COMPRESSION_COMPONENT_TYPE

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
  readonly data = computed(() => this.message()?.data as TMessageComponent)
  readonly category = computed(() => this.data()?.category || 'Tool')

  readonly tasks = computed(() => (<TMessageComponent<{ tasks: IXpertTask[] }>>this.data())?.tasks)
  readonly step = computed(() => <TMessageComponent<TMessageComponentStep>>this.data())
  readonly duration = computed(() => {
    const start = this.step()?.created_date ? new Date(this.step()?.created_date) : new Date()
    const end = this.step()?.end_date ? new Date(this.step()?.end_date) : new Date()
    return (end.getTime() - start.getTime()) / 1000
  })
  readonly conversationStatus = computed(() => this.chatService.conversation()?.status)

  openComponentMessage() {
    if (this.data()?.category === 'Computer') {
      this.openInCanvas(this.data())
    } else if (this.data()?.category === 'Tool') {
      console.log(this.data())
    }
  }

  openInCanvas(data: TMessageComponent) {
    this.homeService.canvasOpened.set({
      opened: true,
      type: 'Computer',
      componentId: this.message()?.id
    })
  }
}
