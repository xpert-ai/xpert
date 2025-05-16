import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, input } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { IKnowledgebase, IKnowledgeDocument, KDocumentSourceType } from '../../../@core/types'
import { DIALOG_DATA } from '@angular/cdk/dialog'

@Component({
  standalone: true,
  imports: [CommonModule, TranslateModule],
  selector: 'knowledge-select-reference',
  templateUrl: `select.component.html`,
  styleUrl: `select.component.scss`
})
export class KnowledgeSelectReferenceComponent {
  eKDocumentSourceType = KDocumentSourceType

  readonly data = inject<{knowledgebases: IKnowledgebase[]}>(DIALOG_DATA)

  readonly knowledgebases = computed(() => this.data?.knowledgebases)
}
