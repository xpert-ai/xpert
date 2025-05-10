import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, effect, inject, model } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { injectToastr, IStorageFile, StorageFileService } from '@cloud/app/@core'
import { injectI18nService } from '@cloud/app/@shared/i18n'
import { injectConfirmDelete } from '@metad/ocap-angular/common'
import { NgmDensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ChatAttachmentComponent } from '../attachment/attachment.component'

/**
 *
 */
@Component({
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    FormsModule,
    CdkMenuModule,
    TranslateModule,
    MatTooltipModule,
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
  readonly #dialog = inject(Dialog)
  readonly #toastr = injectToastr()
  readonly confirmDelete = injectConfirmDelete()
  readonly i18n = injectI18nService()
  readonly storageFileService = inject(StorageFileService)

  // Inputs
  readonly attachments = model<{ file?: File; storageFile?: IStorageFile; error?: string; uploading?: boolean }[]>()

  constructor() {
    effect(() => {
      // console.log(this.files())
    })
  }

  setStorageFile(index: number, storageFile: IStorageFile) {
    this.attachments.update((state) => {
      state[index] = {
        ...state[index],
        storageFile
      }
      return [...state]
    })
  }
}
