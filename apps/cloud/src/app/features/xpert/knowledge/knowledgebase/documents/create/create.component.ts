import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, inject, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatProgressBarModule } from '@angular/material/progress-bar'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ActivatedRoute, Router } from '@angular/router'
import { WaIntersectionObserver } from '@ng-web-apis/intersection-observer'
import { TranslateModule } from '@ngx-translate/core'
import { BehaviorSubject } from 'rxjs'
import {
  DocumentTextParserConfig,
  IIntegration,
  IKnowledgeDocument,
  KDocumentSourceType,
  KDocumentWebTypeEnum,
  KnowledgebaseService,
  KnowledgeDocumentService,
  StorageFileService,
  TDocumentWebOptions,
  ToastrService,
  TRagWebResult,
} from '../../../../../../@core'
import { KnowledgebaseComponent } from '../../knowledgebase.component'
import { KnowledgeDocumentsComponent } from '../documents.component'
import { KnowledgeDocumentCreateStep1Component } from './step-1/step.component'
import { KnowledgeDocumentCreateStep2Component } from './step-2/step.component'
import { KnowledgeDocumentCreateStep3Component } from './step-3/step.component'
import { TSelectOption } from '@metad/ocap-angular/core'
import { TFileItem } from '../types'
import { injectQueryParams } from 'ngxtension/inject-query-params'
import { toSignal } from '@angular/core/rxjs-interop'


@Component({
  standalone: true,
  selector: 'xpert-knowledge-document-create',
  templateUrl: './create.component.html',
  styleUrls: ['./create.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    CdkMenuModule,
    CdkListboxModule,
    MatTooltipModule,
    MatProgressBarModule,
    WaIntersectionObserver,

    KnowledgeDocumentCreateStep1Component,
    KnowledgeDocumentCreateStep2Component,
    KnowledgeDocumentCreateStep3Component
  ]
})
export class KnowledgeDocumentCreateComponent {
  eKDocumentSourceType = KDocumentSourceType

  readonly knowledgebaseAPI = inject(KnowledgebaseService)
  readonly knowledgeDocumentService = inject(KnowledgeDocumentService)
  readonly #toastr = inject(ToastrService)
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly storageFileService = inject(StorageFileService)
  readonly knowledgebaseComponent = inject(KnowledgebaseComponent)
  readonly documentsComponent = inject(KnowledgeDocumentsComponent)
  readonly parentId = injectQueryParams('parentId')

  readonly knowledgebase = this.knowledgebaseComponent.knowledgebase

  readonly refresh$ = new BehaviorSubject<boolean>(true)

  readonly loading = signal(false)

  readonly step = signal(0)

  // Step 1
  readonly sourceType = model<KDocumentSourceType[]>([KDocumentSourceType.FILE])
  readonly fileList = signal<TFileItem[]>([])
  readonly webTypes = model<TSelectOption<KDocumentWebTypeEnum>[]>([])
  readonly integration = model<IIntegration>(null)
  readonly webOptions = model<TDocumentWebOptions>(null)
  readonly webResult = signal<TRagWebResult>(null)
  readonly selectedWebPages = signal<string[]>([])

  // Step 2
  readonly parserConfig = model<DocumentTextParserConfig>({} as DocumentTextParserConfig)
  readonly step2Avaiable = computed(() => this.fileList()?.length || this.webResult()?.docs?.length)

  // Step 3
  readonly documents = signal<IKnowledgeDocument[]>([])
  readonly step3Avaiable = computed(() => this.step2Avaiable())

  // Strategies
  readonly textSplitterStrategies = toSignal(this.knowledgebaseAPI.getTextSplitterStrategies())
  readonly documentTransformerStrategies = toSignal(this.knowledgebaseAPI.getDocumentTransformerStrategies())

  nextStep() {
    this.step.update((state) => ++state)
  }

  prevStep() {
    this.step.update((state) => --state)
  }

  close() {
    this.#router.navigate(['..'], { relativeTo: this.#route, queryParams: { parentId: this.parentId() } })
  }

  apply() {
    this.documentsComponent.refresh()
    this.close()
  }

  updateFileDocs(docs: IKnowledgeDocument[]) {
    this.fileList.update((state) => {
      docs.forEach((doc) => {
        const index = state.findIndex((_) => _.doc?.id === doc.id)
        if (index > -1) {
          state[index] = {
            ...state[index],
            doc: {
              ...state[index].doc,
              ...doc
            }
          }
        }
      })
      return Array.from(state)
    })
  }

  updateDocs(docs: IKnowledgeDocument[]) {
    this.documents.update((state) => {
      docs.forEach((doc) => {
        const index = state.findIndex((_) => _.id === doc.id)
        if (index > -1) {
          state[index] = {
            ...state[index],
            ...doc
          }
        }
      })
      return Array.from(state)
    })
  }
}
