import { CdkMenuModule } from '@angular/cdk/menu'

import { ChangeDetectionStrategy, Component, computed, effect, input } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { FileTypePipe, ListHeightStaggerAnimation } from '@xpert-ai/core'
import { NgmCommonModule } from '@xpert-ai/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { IChatMessage } from '@cloud/app/@core'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
import { FileIconComponent } from '../../../files'
import { getReferenceKey, getReferenceLabel, getReferenceSource } from '../../references'
import {
  getHumanMessageAttachmentExtension,
  getHumanMessageAttachmentKey,
  getHumanMessageAttachmentList,
  getHumanMessageAttachmentName,
  getHumanMessageAttachmentPreviewUrl,
  getHumanMessageReferenceList,
  getHumanMessageTextContent,
  isHumanMessageAttachmentImage,
  type HumanMessageAttachment
} from './message-attachments'
@Component({
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    TranslateModule,
    CdkMenuModule,
    ...ZardTooltipImports,
    NgmCommonModule,
    FileIconComponent,
    FileTypePipe
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
  readonly content = computed(() => getHumanMessageTextContent(this.message()))
  readonly attachments = computed(() => getHumanMessageAttachmentList(this.message()))
  readonly references = computed(() => getHumanMessageReferenceList(this.message()))
  readonly attachmentKey = getHumanMessageAttachmentKey
  readonly attachmentName = getHumanMessageAttachmentName
  readonly attachmentPreviewUrl = getHumanMessageAttachmentPreviewUrl
  readonly attachmentExtension = getHumanMessageAttachmentExtension
  readonly attachmentIsImage = isHumanMessageAttachmentImage
  readonly referenceKey = getReferenceKey
  readonly referenceLabel = getReferenceLabel
  readonly referenceSource = getReferenceSource

  constructor() {
    effect(() => {
      // console.log(this.attachments())
    })
  }

  openAttachment(attachment: HumanMessageAttachment) {
    const url = this.attachmentPreviewUrl(attachment)
    if (!url) {
      return
    }

    const popup = window.open(url, '_blank', 'noopener,noreferrer')
    if (popup) {
      popup.opener = null
    }
  }
}
