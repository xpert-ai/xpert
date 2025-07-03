import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { XpertHomeService } from '../home.service'
import { ChatCanvasComputerComponent } from './computer/computer.component'
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

  readonly homeService = inject(XpertHomeService)

  readonly canvas = this.homeService.canvasOpened
  readonly opened = computed(() => this.canvas()?.opened)
  readonly canvasType = computed(() => this.canvas()?.type)
  readonly componentId = computed(() => this.canvas()?.componentId)

  constructor() {
    effect(
      () => {
        const conversation = this.homeService.conversation()
        if (
          conversation?.messages &&
          this.canvas()?.messageId &&
          !conversation.messages.some((_) => _.id === this.canvas().messageId)
        ) {
          this.canvas.update((state) => ({ opened: true, type: state.type }))
        }
      },
      { allowSignalWrites: true }
    )
  }
}
