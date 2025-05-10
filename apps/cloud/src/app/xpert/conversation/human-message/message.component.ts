import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { ListHeightStaggerAnimation } from '@metad/core'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { ChatAttachmentsComponent } from '@cloud/app/@shared/chat'
import { TCopilotChatMessage } from '../../types'


@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    RouterModule,
    TranslateModule,
    CdkMenuModule,
    MatTooltipModule,
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
  readonly attachments = computed(() => this.message()?.attachments?.map((storageFile) => ({storageFile})))

  constructor() {
    effect(() => {
      console.log(this.attachments())
    })
  }
}
