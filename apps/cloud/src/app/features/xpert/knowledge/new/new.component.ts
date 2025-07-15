import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { Component, inject, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { CopilotModelSelectComponent } from '@cloud/app/@shared/copilot'
import { TranslateModule } from '@ngx-translate/core'
import {
  AiModelTypeEnum,
  getErrorMessage,
  ICopilotModel,
  IKnowledgebase,
  KnowledgebaseService,
  ToastrService,
  XpertService,
  XpertTypeEnum
} from '../../../../@core'

@Component({
  selector: 'xpert-new-knowledge',
  standalone: true,
  imports: [CommonModule, TranslateModule, DragDropModule, FormsModule, CopilotModelSelectComponent],
  templateUrl: './new.component.html',
  styleUrl: './new.component.scss'
})
export class XpertNewKnowledgeComponent {
  eXpertTypeEnum = XpertTypeEnum
  eAiModelTypeEnum = AiModelTypeEnum
  readonly #dialogRef = inject(DialogRef<IKnowledgebase | undefined>)
  readonly #dialogData = inject<{ workspaceId: string }>(DIALOG_DATA)
  readonly xpertService = inject(XpertService)
  readonly #toastr = inject(ToastrService)
  readonly knowledgebaseService = inject(KnowledgebaseService)

  readonly workspaceId = signal(this.#dialogData?.workspaceId)
  readonly name = model<string>()
  readonly copilotModel = model<ICopilotModel>()
  readonly rerankModel = model<ICopilotModel>()

  readonly loading = signal(false)

  create() {
    this.knowledgebaseService
      .create({
        name: this.name(),
        workspaceId: this.workspaceId(),
        copilotModel: this.copilotModel(),
        rerankModel: this.rerankModel(),
      })
      .subscribe({
        next: (knowledgebase) => {
          this.#toastr.success('PAC.Messages.CreatedSuccessfully', { Default: 'Created successfully!' })
          this.close(knowledgebase)
        },
        error: (error) => {
          this.#toastr.error(getErrorMessage(error))
        }
      })
  }

  close(value?: IKnowledgebase) {
    this.#dialogRef.close(value)
  }
}
