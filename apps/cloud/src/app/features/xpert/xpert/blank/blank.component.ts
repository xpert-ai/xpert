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
  XpertAPIService,
  XpertTypeEnum
} from '../../../../@core'
import { genAgentKey } from '../../utils'
import { XpertBasicFormComponent } from 'apps/cloud/src/app/@shared/xpert'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { NgmSpinComponent } from '@metad/ocap-angular/common'

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
    NgmSpinComponent,
    XpertBasicFormComponent,
  ],
  templateUrl: './blank.component.html',
  styleUrl: './blank.component.scss'
})
export class XpertNewBlankComponent {
  eXpertTypeEnum = XpertTypeEnum
  readonly #dialogRef = inject(DialogRef<IXpert>)
  readonly #dialogData = inject<{ workspace: IXpertWorkspace; type: XpertTypeEnum }>(DIALOG_DATA)
  readonly xpertService = inject(XpertAPIService)
  readonly #toastr = inject(ToastrService)

  readonly type = signal(this.#dialogData.type)
  readonly types = model<XpertTypeEnum[]>([this.#dialogData.type ?? XpertTypeEnum.Agent])
  readonly name = model<string>()
  readonly description = model<string>()
  readonly avatar = model<TAvatar>()
  readonly title = model<string>()
  readonly copilotModel = model<ICopilotModel>()

  readonly loading = signal(false)

  create() {
    this.loading.set(true)
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
          avatar: this.avatar(),
          options: {
            vision: {
              enabled: true,
            }
          }
        }
      })
      .subscribe({
        next: (xpert) => {
          this.loading.set(false)
          this.#toastr.success(`PAC.Messages.CreatedSuccessfully`, { Default: 'Created Successfully' })
          this.close(xpert)
        },
        error: (error) => {
          this.loading.set(false)
          this.#toastr.error(getErrorMessage(error))
        }
      })
  }

  close(value?: IXpert) {
    this.#dialogRef.close(value)
  }
}
