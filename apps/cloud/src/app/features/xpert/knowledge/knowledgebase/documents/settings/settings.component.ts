import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, inject, model } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import {
  getErrorMessage,
  IKnowledgeDocument,
  injectToastr,
  KDocumentSourceType,
  KnowledgebaseService,
  KnowledgeDocumentService
} from '@cloud/app/@core'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { linkedModel, myRxResource } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { pick } from 'lodash-es'
import { injectParams } from 'ngxtension/inject-params'
import { injectQueryParams } from 'ngxtension/inject-query-params'
import { KnowledgeDocumentCreateSettingsComponent } from '../create/settings/settings.component'
import { KnowledgeDocumentsComponent } from '../documents.component'
import { KnowledgeDocumentPipelineSettingsComponent } from '../pipeline/settings/settings.component'

@Component({
  standalone: true,
  selector: 'xp-knowledge-document-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    TranslateModule,
    CdkMenuModule,
    NgmSpinComponent,
    KnowledgeDocumentCreateSettingsComponent,
    KnowledgeDocumentPipelineSettingsComponent
  ]
})
export class KnowledgeDocumentSettingsComponent {
  eKDocumentSourceType = KDocumentSourceType

  readonly paramId = injectParams('id')
  readonly kbAPI = inject(KnowledgebaseService)
  readonly kDocumentAPI = inject(KnowledgeDocumentService)
  readonly documentsComponent = inject(KnowledgeDocumentsComponent)
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly #toastr = injectToastr()
  readonly parentId = injectQueryParams('parentId')

  readonly #documentRes = myRxResource({
    request: () => this.paramId(),
    loader: ({ request }) => {
      return request
        ? this.kDocumentAPI.getOneById(request, { relations: ['knowledgebase', 'knowledgebase.pipeline'] })
        : null
    }
  })

  readonly document = this.#documentRes.value

  readonly documents = linkedModel({
    initialValue: null,
    compute: () => (this.document() ? [this.document()] : []),
    update: (value) => {
      //
    }
  })

  readonly parserConfig = linkedModel({
    initialValue: {},
    compute: () => this.document()?.parserConfig ?? {},
    update: (value) => {
      this.document().parserConfig = value
    }
  })

  readonly sourceConfig = computed(() => this.document()?.sourceConfig)
  readonly knowledgebase = computed(() => this.document()?.knowledgebase)
  readonly pipeline = computed(() => this.knowledgebase()?.pipeline)

  readonly parametersValue = model<Partial<Record<string, unknown>>>({})

  readonly loading = computed(() => this.#documentRes.status() === 'loading')

  processDocuments() {
    this.kDocumentAPI
      .updateBulk(
        this.documents().map((doc) => pick(doc, ['id', 'parserConfig', 'options', 'disabled'])),
        true
      )
      .subscribe({
        next: () => {
          this.documentsComponent.refresh()
          this.backToDocuments()
        },
        error: (error) => {
          this.#toastr.error(getErrorMessage(error))
        }
      })
  }

  saveAndProcess() {
    this.kbAPI
      .createTask(this.knowledgebase().id, {
        taskType: 'document_reprocess',
        status: 'running', // Start processing immediately
        documents: [
          {
            id: this.document().id
          } as IKnowledgeDocument
        ]
      })
      .subscribe({
        next: () => {
          this.documentsComponent.refresh()
          this.backToDocuments()
        },
        error: (error) => {
          this.#toastr.error(getErrorMessage(error))
        }
      })
  }

  backToDocuments() {
    this.#router.navigate(['../../'], { relativeTo: this.#route, queryParams: { parentId: this.parentId() } })
  }
}
