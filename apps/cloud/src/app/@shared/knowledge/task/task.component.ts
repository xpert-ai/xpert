import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { Component, computed, inject, model } from '@angular/core'
import { IKnowledgebase, KnowledgeDocumentService } from '@cloud/app/@core'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { myRxResource } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'

@Component({
  standalone: true,
  imports: [CommonModule, TranslateModule, NgmSpinComponent],
  selector: 'xp-knowledge-task',
  templateUrl: 'task.component.html',
  styleUrls: ['task.component.scss']
})
export class KnowledgeTaskComponent {
  readonly #data = inject<{ knowledgebase: IKnowledgebase; documentId: string }>(DIALOG_DATA)
  readonly knowledgeDocAPI = inject(KnowledgeDocumentService)
  readonly #dialogRef = inject(DialogRef)

  readonly knowledgebase = model(this.#data.knowledgebase)
  readonly documentId = model(this.#data.documentId)

  readonly #docResource = myRxResource({
    request: () => ({ knowledgebaseId: this.knowledgebase().id, id: this.documentId() }),
    loader: ({ request }) => {
      return request.knowledgebaseId && request.id
        ? this.knowledgeDocAPI.getById(request.id, {
          select: {
            id: true,
            category: true,
            tasks: {
              id: true,
              taskType: true,
              status: true,
              context: true,
              steps: true,
            }
          },
          relations: ['tasks'] })
        : null
    }
  })

  readonly document = this.#docResource.value
  readonly isLoading = computed(() => this.#docResource.status() === 'loading')
  readonly error = this.#docResource.error


  onClose() {
    this.#dialogRef.close()
  }
}
