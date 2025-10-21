import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { Component, computed, inject, model, signal } from '@angular/core'
import { DateRelativePipe, IKnowledgebase, KnowledgeDocumentService } from '@cloud/app/@core'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { myRxResource } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { MarkdownModule } from 'ngx-markdown'
import { ChatMessageExecutionPanelComponent } from '../../chat'

@Component({
  standalone: true,
  imports: [CommonModule, TranslateModule, MarkdownModule, NgmSpinComponent, DateRelativePipe, ChatMessageExecutionPanelComponent],
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
              createdAt: true,
              status: true,
              error: true,
              context: true,
              steps: true,
              executionId: true
            }
          },
          relations: ['tasks'],
        })
        : null
    }
  })

  readonly #document = this.#docResource.value
  readonly isLoading = computed(() => this.#docResource.status() === 'loading')
  readonly error = this.#docResource.error
  readonly tasks = computed(() => this.#document()?.tasks?.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) || [])

  readonly executionId = signal<string>(null)

  openExecution(executionId: string) {
    this.executionId.set(executionId)
  }

  onClose() {
    this.#dialogRef.close()
  }
}
