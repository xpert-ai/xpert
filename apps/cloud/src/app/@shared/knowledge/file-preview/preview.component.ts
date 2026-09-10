import { CommonModule } from '@angular/common'
import { Component, computed, inject, input, output } from '@angular/core'
import { injectToastr, KBDocumentCategoryEnum, KnowledgeDocumentService, KnowledgeFileUploader } from '@cloud/app/@core'
import { DocumentInterface } from '@langchain/core/documents'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'
import { map, startWith } from 'rxjs'

@Component({
  standalone: true,
  selector: 'xp-knowledge-file-preview',
  templateUrl: './preview.component.html',
  styleUrl: './preview.component.scss',
  imports: [CommonModule, TranslateModule, ZardButtonComponent]
})
export class KnowledgeFilePreviewComponent {
  eKBDocumentCategoryEnum = KBDocumentCategoryEnum

  readonly knowledgeDocumentService = inject(KnowledgeDocumentService)
  readonly #toastr = injectToastr()

  // Inputs
  readonly file = input<KnowledgeFileUploader>()

  // Outputs
  readonly closed = output<void>()
  readonly previewState = computed(() =>
    this.file().preview$.pipe(
      map((documents) => ({ loading: false, documents })),
      startWith({ loading: true, documents: null })
    )
  )

  // States

  totalChars(docs: DocumentInterface[]) {
    return docs.reduce((acc, doc) => acc + doc.pageContent.length, 0)
  }
}
