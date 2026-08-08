import { Component, computed, effect, inject, model } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { XpSpinComponent } from '@xpert-ai/headless-ui'
import { myRxResource } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { injectParams } from 'ngxtension/inject-params'
import {
  DocumentParserConfig,
  IKnowledgeDocumentPage,
  injectToastr,
  KBDocumentCategoryEnum,
  KnowledgeDocumentService
} from '../../../../../../../@core'
import { KnowledgebaseComponent } from '../../../knowledgebase.component'

@Component({
  standalone: true,
  selector: 'xpert-knowledge-document-webpages',
  templateUrl: './webpages.component.html',
  styleUrl: './webpages.component.scss',
  imports: [FormsModule, TranslateModule, XpSpinComponent]
})
export class KnowledgeDocumentWebpagesComponent {
  eKBDocumentCategoryEnum = KBDocumentCategoryEnum

  readonly knowledgeDocumentService = inject(KnowledgeDocumentService)
  readonly knowledgebaseComponent = inject(KnowledgebaseComponent)
  readonly #toastr = injectToastr()
  readonly paramId = injectParams('id')

  readonly knowledgebase = this.knowledgebaseComponent.knowledgebase

  // Inputs
  readonly item = model<IKnowledgeDocumentPage>(null)
  readonly parserConfig = model<DocumentParserConfig>()

  // Estimate embedding for file or webpage
  readonly estimateFile = myRxResource({
    request: () => ({
      parserConfig: this.parserConfig(),
      knowledgebaseId: this.knowledgebase().id,
      pages: [{ metadata: this.item().metadata, pageContent: '' }]
    }),
    loader: ({ request }) => this.knowledgeDocumentService.estimate(request)
  })

  readonly loading = computed(() => this.estimateFile.status() === 'loading')
  readonly docs = computed(() => this.estimateFile.value())
  readonly error = computed(() => this.estimateFile.error())

  constructor() {
    effect(() => {
      // console.log(this.item())
    })
  }
}
