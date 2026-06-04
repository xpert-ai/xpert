import { CdkMenuModule } from '@angular/cdk/menu'

import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  model,
  input,
  output
} from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { injectToastr, StorageFileService } from '@cloud/app/@core'
import { injectI18nService } from '@cloud/app/@shared/i18n'
import { injectConfirmDelete } from '@xpert-ai/ocap-angular/common'
import { NgmDensityDirective } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ChatAttachmentComponent } from '../attachment/attachment.component'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
import { getChatStorageFileId, isChatAgentFile, type ChatAgentFile, type ChatAttachmentStorageFile } from './agent-file'
/**
 *
 */
@Component({
  standalone: true,
  imports: [
    RouterModule,
    ReactiveFormsModule,
    FormsModule,
    CdkMenuModule,
    TranslateModule,
    ...ZardTooltipImports,
    ChatAttachmentComponent
],
  selector: 'chat-attachments',
  templateUrl: './attachments.component.html',
  styleUrl: 'attachments.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [
    {
      directive: NgmDensityDirective,
      inputs: ['small', 'large']
    }
  ]
})
export class ChatAttachmentsComponent {
  readonly #toastr = injectToastr()
  readonly confirmDelete = injectConfirmDelete()
  readonly i18n = injectI18nService()
  readonly storageFileService = inject(StorageFileService)

  // Inputs
  readonly attachments =
    model<{ file?: File; url?: string; storageFile?: ChatAttachmentStorageFile; error?: string; uploading?: boolean }[]>()
  readonly editable = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })
  readonly deletable = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  // Outputs
  readonly onCreated = output<ChatAgentFile>()
  readonly onDeleted = output<string>()

  constructor() {
    effect(() => {
      // console.log(this.files())
    })
  }

  setStorageFile(index: number, storageFile: ChatAttachmentStorageFile) {
    this.attachments.update((state) => {
      state[index] = {
        ...state[index],
        storageFile
      }
      return [...state]
    })
    if (isChatAgentFile(storageFile)) {
      this.onCreated.emit(storageFile)
    }
  }

  remove(index: number) {
    const attachment = this.attachments()[index]
    this.attachments.update((state) => {
      state.splice(index, 1)
      return [...state]
    })
    const storageFileId = attachment.storageFile ? getChatStorageFileId(attachment.storageFile) : undefined
    if (storageFileId) {
      this.onDeleted.emit(storageFileId)
    }
  }
}
