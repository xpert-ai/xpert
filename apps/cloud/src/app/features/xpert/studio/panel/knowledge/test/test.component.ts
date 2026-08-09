import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  model,
  output,
  signal
} from '@angular/core'
import {
  DocumentMetadata,
  getErrorMessage,
  IKnowledgebase,
  KnowledgeFilterDiagnostics,
  KnowledgebaseService,
  TKBRecallParams,
  TKBRetrievalSettings,
  ToastrService
} from 'apps/cloud/src/app/@core'
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
  imports: [CommonModule, FormsModule, TranslateModule],
  host: {
    tabindex: '-1'
  }
})
export class XpertKnowledgeTestComponent {
  readonly elementRef = inject(ElementRef)
  readonly knowledgebaseService = inject(KnowledgebaseService)
  readonly #toastr = inject(ToastrService)

  // Inputs
  readonly knowledgebase = input<IKnowledgebase>()
  readonly recall = input<TKBRecallParams>()
  readonly retrieval = input<TKBRetrievalSettings>()

  // Outputs
  readonly close = output<void>()

  // States
  readonly query = model<string>()
  readonly docs = signal<DocumentInterface<DocumentMetadata>[]>([])
  readonly diagnostics = signal<KnowledgeFilterDiagnostics[]>([])
  readonly diagnosticsText = computed(() => JSON.stringify(this.diagnostics(), null, 2))

  readonly running = signal(false)
  #runSubscription: Subscription = null

  onTest() {
    this.running.set(true)
    this.#runSubscription = this.knowledgebaseService
      .test(this.knowledgebase().id, {
        query: this.query(),
        k: this.recall()?.topK ?? 10,
        score: this.recall()?.score ?? 0.2,
        retrieval: this.retrieval()
      })
      .subscribe({
        next: (result) => {
          this.docs.set(result.documents)
          this.diagnostics.set(result.diagnostics)
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

  openChunk(chunk) {}

  onClose() {
    this.close.emit()
  }
}
