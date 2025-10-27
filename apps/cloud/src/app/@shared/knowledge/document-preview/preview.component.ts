import { Component, computed, effect, inject, input, model } from '@angular/core'
import { FormsModule } from '@angular/forms'
import {
  IKnowledgeDocument,
  injectToastr,
  KBDocumentCategoryEnum,
  KnowledgeDocumentService
} from '@cloud/app/@core'
import { KnowledgeChunkComponent } from '@cloud/app/@shared/knowledge'
import { TranslateModule } from '@ngx-translate/core'

@Component({
  standalone: true,
  selector: 'xp-knowledge-document-preview',
  templateUrl: './preview.component.html',
  styleUrl: './preview.component.scss',
  imports: [FormsModule, TranslateModule, KnowledgeChunkComponent]
})
export class KnowledgeDocumentPreviewComponent {
  eKBDocumentCategoryEnum = KBDocumentCategoryEnum

  readonly knowledgeDocumentService = inject(KnowledgeDocumentService)
  readonly #toastr = injectToastr()

  // Inputs
  readonly document = model<Partial<IKnowledgeDocument>>()

  // States
  readonly chunks = computed(() => this.document()?.chunks ?? this.document()?.draft.chunks ?? [])
}
