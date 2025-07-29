import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, model, output, signal } from '@angular/core'
import { getErrorMessage, IKnowledgebase, KnowledgebaseService, TKBRecallParams, ToastrService } from 'apps/cloud/src/app/@core'
import { CommonModule } from '@angular/common'
import { Subscription } from 'rxjs'
import { FormsModule } from '@angular/forms'
import { DocumentInterface } from '@langchain/core/documents'
import { TranslateModule } from '@ngx-translate/core'

@Component({
  selector: 'xpert-knowledge-test',
  templateUrl: './test.component.html',
  styleUrls: ['./test.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ CommonModule, FormsModule, TranslateModule ],
  host: {
    tabindex: '-1',
  }
})
export class XpertKnowledgeTestComponent {
  readonly elementRef = inject(ElementRef)
  readonly knowledgebaseService = inject(KnowledgebaseService)
  readonly #toastr = inject(ToastrService)

  // Inputs
  readonly knowledgebase = input<IKnowledgebase>()
  readonly recall = input<TKBRecallParams>()

  // Outputs
  readonly close = output<void>()

  // States
  readonly query = model<string>()
  readonly docs = signal<{ doc: DocumentInterface; score: number }[]>([])

  readonly running = signal(false)
  #runSubscription: Subscription = null

  onTest() {
    this.running.set(true)
    this.#runSubscription = this.knowledgebaseService.test(this.knowledgebase().id, {
      query: this.query(),
      k: this.recall()?.topK ?? 10,
      score: this.recall()?.score ?? 0.2,
    }).subscribe({
      next: (result) => {
        this.docs.set(result)
        this.running.set(false)
      },
      error: (err) => {
        this.#toastr.error(getErrorMessage(err))
        this.running.set(false)
      }
    })
  }

  stopTest() {
    this.#runSubscription?.unsubscribe()
    this.running.set(false)
  }

  openChunk(chunk) {
    
  }

  onClose() {
    this.close.emit()
  }
}
