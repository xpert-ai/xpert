import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { ChatMessageStepType } from '../../../@core'
import { ChatCanvasComputerComponent } from './computer/computer.component'
import { ChatHomeService } from '../home.service'
import { ChatCanvasDashboardComponent } from './dashboard/dashboard.component'
import { ChatCanvasFileViewerComponent } from './file-viewer/file-viewer.component'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    CdkMenuModule,
    RouterModule,
    TranslateModule,
    ChatCanvasComputerComponent,
    ChatCanvasDashboardComponent,
    ChatCanvasFileViewerComponent
  ],
  selector: 'pac-chat-canvas',
  templateUrl: './canvas.component.html',
  styleUrl: 'canvas.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatCanvasComponent {
  eChatMessageStepType = ChatMessageStepType
  
  readonly homeService = inject(ChatHomeService)
  
  readonly canvas = this.homeService.canvasOpened
  readonly canvasType = computed(() => this.canvas()?.type)

  constructor() {
    effect(() => {
      const conversation = this.homeService.conversation()
      if (conversation?.messages && this.canvas()?.messageId && !conversation.messages.some((_) => _.id === this.canvas().messageId)) {
        this.canvas.update((state) => ({type: state.type}))
      }
    }, { allowSignalWrites: true })
  }
}
