import { CdkMenuModule } from '@angular/cdk/menu'

import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { ListHeightStaggerAnimation } from '@xpert-ai/core'
import { NgmCommonModule } from '@xpert-ai/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { ChatAttachmentsComponent } from '@cloud/app/@shared/chat'
import { TCopilotChatMessage } from '../../types'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
@Component({
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    RouterModule,
    TranslateModule,
    CdkMenuModule,
    ...ZardTooltipImports,
    NgmCommonModule,
    ChatAttachmentsComponent
],
  selector: 'chat-human-message',
  templateUrl: './message.component.html',
  styleUrl: 'message.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [ListHeightStaggerAnimation]
})
export class ChatHumanMessageComponent {
  // Inputs
  readonly message = input<TCopilotChatMessage>()

  // States
  readonly attachments = computed(() => this.message()?.attachments?.map((storageFile) => ({ storageFile })))

  constructor() {
    effect(() => {
      // console.log(this.attachments())
    })
  }
}
