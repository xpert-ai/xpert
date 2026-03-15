import { CdkMenuModule } from '@angular/cdk/menu'

import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { ListHeightStaggerAnimation } from '@metad/core'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { IChatMessage } from '@cloud/app/@core'
import { ChatAttachmentsComponent } from '../../attachments/attachments.component'
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
  selector: 'chat-preview-human-message',
  templateUrl: './message.component.html',
  styleUrl: 'message.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [ListHeightStaggerAnimation]
})
export class ChatHumanMessageComponent {
  // Inputs
  readonly message = input<IChatMessage>()

  // States
  readonly attachments = computed(() => this.message()?.attachments?.map((storageFile) => ({ storageFile })))

  constructor() {
    effect(() => {
      // console.log(this.attachments())
    })
  }
}
