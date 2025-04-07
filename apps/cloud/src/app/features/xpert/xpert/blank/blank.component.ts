import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { CommonModule } from '@angular/common'
import { Component, inject, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatInputModule } from '@angular/material/input'
import { TranslateModule } from '@ngx-translate/core'
import {
  getErrorMessage,
  ICopilotModel,
  IXpert,
  IXpertWorkspace,
  TAvatar,
  ToastrService,
  XpertService,
  XpertTypeEnum
} from '../../../../@core'
import { genAgentKey } from '../../utils'
import { XpertBasicFormComponent } from 'apps/cloud/src/app/@shared/xpert'
import { DragDropModule } from '@angular/cdk/drag-drop'

@Component({
  selector: 'xpert-new-blank',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    DragDropModule,
    MatInputModule,
    FormsModule,
    CdkListboxModule,
    XpertBasicFormComponent
  ],
  templateUrl: './blank.component.html',
  styleUrl: './blank.component.scss'
})
export class XpertNewBlankComponent {
  eXpertTypeEnum = XpertTypeEnum
  readonly #dialogRef = inject(DialogRef<IXpert>)
  readonly #dialogData = inject<{ workspace: IXpertWorkspace }>(DIALOG_DATA)
  readonly xpertService = inject(XpertService)
  readonly #toastr = inject(ToastrService)

  readonly types = model<XpertTypeEnum[]>([XpertTypeEnum.Agent])
  readonly name = model<string>()
  readonly description = model<string>()
  readonly avatar = model<TAvatar>()
  readonly title = model<string>()
  readonly copilotModel = model<ICopilotModel>()

  create() {
    this.xpertService
      .create({
        type: this.types()[0],
        name: this.name(),
        title: this.title(),
        description: this.description(),
        copilotModel: this.copilotModel(),
        latest: true,
        workspaceId: this.#dialogData?.workspace?.id,
        avatar: this.avatar(),
        agent: {
          key: genAgentKey(),
          avatar: this.avatar()
        }
      })
      .subscribe({
        next: (xpert) => {
          this.#toastr.success(`PAC.Messages.CreatedSuccessfully`, { Default: 'Created Successfully' })
          this.close(xpert)
        },
        error: (error) => {
          this.#toastr.error(getErrorMessage(error))
        }
      })
  }

  close(value?: IXpert) {
    this.#dialogRef.close(value)
  }
}
