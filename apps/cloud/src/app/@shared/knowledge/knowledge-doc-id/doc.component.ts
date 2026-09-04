import { Component, computed, input } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { IKnowledgeDocument, IKnowledgeFAQChunkMetadata, KDocumentSourceType } from '../../../@core/types'
import { XpCommonModule, ZardIconComponent } from '@xpert-ai/headless-ui'
import { resolveKnowledgeDocumentFileKind } from '../document-file-kind'

@Component({
  standalone: true,
  imports: [TranslateModule, XpCommonModule, ZardIconComponent],
  selector: 'knowledge-doc-id',
  templateUrl: `doc.component.html`,
  styleUrl: `doc.component.scss`
})
export class KnowledgeDocIdComponent {
  eKDocumentSourceType = KDocumentSourceType

  // Inputs
  readonly doc = input<Partial<IKnowledgeDocument>>()
  readonly searchText = input<string | undefined>()
  readonly contentKind = input<IKnowledgeFAQChunkMetadata['contentKind'] | undefined>()

  // States
  readonly sourceType = computed(() => this.doc().sourceType)
  readonly type = computed(() => this.doc().type)
  readonly category = computed(() => this.doc().category)
  readonly storageFile = computed(() => this.doc().storageFile)
  readonly label = computed(() => this.doc().name || this.storageFile()?.originalName || this.doc().options?.url)
  // Resolve the icon from file evidence instead of relying only on the backend document type label.
  readonly fileKind = computed(() => resolveKnowledgeDocumentFileKind(this.doc()))
}
