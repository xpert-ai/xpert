import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { ChatMessageStepType } from '../../../@core'
import { ChatCanvasComputerComponent } from './computer/computer.component'
import { ChatHomeService } from '../home.service'
import { ChatCanvasDashboardComponent } from './dashboard/dashboard.component'

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
    ChatCanvasDashboardComponent
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
}
