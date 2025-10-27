import { CommonModule } from '@angular/common'
import { Component, computed, effect, input } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { IKnowledgeDocument, KDocumentSourceType } from '../../../@core/types'
import { NgmCommonModule } from "@metad/ocap-angular/common";

@Component({
  standalone: true,
  imports: [CommonModule, TranslateModule, NgmCommonModule],
  selector: 'knowledge-doc-id',
  templateUrl: `doc.component.html`,
  styleUrl: `doc.component.scss`
})
export class KnowledgeDocIdComponent {
  eKDocumentSourceType = KDocumentSourceType

  // Inputs
  readonly doc = input<Partial<IKnowledgeDocument>>()
  readonly searchText = input<string | undefined>()

  // States
  readonly sourceType = computed(() => this.doc().sourceType)
  readonly type = computed(() => this.doc().type)
  readonly category = computed(() => this.doc().category)
  readonly storageFile = computed(() => this.doc().storageFile)
  readonly label = computed(() => this.doc().name || this.storageFile()?.originalName || this.doc().options?.url)

}
