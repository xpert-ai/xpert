import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { DataSettings } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { ChatComponentMessageComponent, XpertHomeService } from '@cloud/app/xpert/'
import {
  ChatMessageStepType,
  injectFormatRelative,
  TChatMessageStep,
  TMessageComponent,
  TMessageContentComponent,
  TProgramToolMessage
} from '@cloud/app/@core'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    CdkMenuModule,
    RouterModule,
    TranslateModule,
    MatTooltipModule,
  ],
  selector: 'chat-canvas-terminal',
  templateUrl: './terminal.component.html',
  styleUrl: 'terminal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatCanvasTerminalComponent {
  eChatMessageStepType = ChatMessageStepType

  readonly step = input<TChatMessageStep<TProgramToolMessage>>()
  
  constructor() {
    // effect(() => {
    //   console.log(this.step())
    // })
  }
}
