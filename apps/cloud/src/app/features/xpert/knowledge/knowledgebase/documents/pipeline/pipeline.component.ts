import { CommonModule } from '@angular/common'
import { SelectionModel } from '@angular/cdk/collections'
import { Component, computed, effect, inject, model, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { myRxResource } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { injectQueryParams } from 'ngxtension/inject-query-params'
import { BehaviorSubject } from 'rxjs'
import {
  _TFile,
  DocumentParserConfig,
  DocumentSourceProviderCategoryEnum,
  injectIntegrationAPI,
  IWFNSource,
  KDocumentSourceType,
  KnowledgebaseService,
  KnowledgeFileUploader,
  StorageFileService,
  ToastrService,
  TXpertTeamNode,
  WorkflowNodeTypeEnum
} from '../../../../../../@core'
import { KnowledgebaseComponent } from '../../knowledgebase.component'
import { KnowledgeDocumentsComponent } from '../documents.component'
import { KnowledgeDocumentPipelineStep1Component } from './step-1/step.component'
import { KnowledgeDocumentPipelineStep2Component } from './step-2/step.component'
import { KnowledgeDocumentCreateStep3Component } from '../step-3/step.component'

@Component({
  standalone: true,
  selector: 'xp-knowledge-document-pipeline',
  templateUrl: './pipeline.component.html',
  styleUrls: ['./pipeline.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    RouterModule,
    KnowledgeDocumentPipelineStep1Component,
    KnowledgeDocumentPipelineStep2Component,
    KnowledgeDocumentCreateStep3Component
  ]
})
export class KnowledgeDocumentPipelineComponent {
  eKDocumentSourceType = KDocumentSourceType
  eDocumentSourceProviderCategoryEnum = DocumentSourceProviderCategoryEnum

  readonly knowledgebaseAPI = inject(KnowledgebaseService)
  readonly #toastr = inject(ToastrService)
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly storageFileService = inject(StorageFileService)
  readonly knowledgebaseComponent = inject(KnowledgebaseComponent)
  readonly documentsComponent = inject(KnowledgeDocumentsComponent)
  readonly integrationAPI = injectIntegrationAPI()
  readonly parentId = injectQueryParams('parentId')

  readonly knowledgebase = this.knowledgebaseComponent.knowledgebase
  readonly knowledgebaseId = this.knowledgebaseComponent.paramId

  readonly refresh$ = new BehaviorSubject<boolean>(true)

  readonly loading = signal(false)

  readonly step = signal(1)

  readonly #pipeline = toSignal(
    this.knowledgebaseAPI.getOneById(this.knowledgebaseComponent.paramId(), {
      relations: ['pipeline'],
      select: ['id', 'name']
    })
  )

  readonly pipeline = computed(() => this.#pipeline()?.pipeline)
  readonly graph = computed(() => this.pipeline()?.graph)
  readonly sources = computed(() =>
    this.graph()?.nodes.filter((node): node is TXpertTeamNode & {type: 'workflow'; entity: IWFNSource } => node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.SOURCE)
  )

  readonly strategies = toSignal(this.knowledgebaseAPI.documentSourceStrategies$)

  readonly sourceStrategies = computed(
    () =>
      this.strategies() &&
      this.sources()?.map((source) => {
        return {
          source,
          strategy: this.strategies().find((s) => s.meta.name === (<IWFNSource>source.entity).provider)
        }
      })
  )

  readonly selectedSource = signal<TXpertTeamNode & {type: 'workflow'; entity: IWFNSource }>(null)
  readonly selectedStrategy = computed(
    () =>
      this.selectedSource() &&
      this.strategies()?.find((s) => s.meta.name === (<IWFNSource>this.selectedSource().entity).provider)
  )
  readonly integration = computed(() => this.selectedStrategy()?.integration)
  readonly integrationService = computed(() => this.integration()?.service)
  readonly providerCategory = computed(() => this.selectedStrategy()?.meta.category)

  readonly #integrations = myRxResource({
    request: () => this.integrationService(),
    loader: ({ request }) => request && this.integrationAPI.selectOptions({ provider: request })
  })

  readonly integrations = this.#integrations.value
  readonly integrationId = computed(() => this.selectedSource()?.entity.integrationId)
  readonly selectedIntegration = computed(() => this.integrations()?.find((i) => i.value === this.integrationId()))
  readonly parserConfig = signal<DocumentParserConfig>({})

  readonly taskId = signal<string>(null)
  readonly #taskResource = myRxResource({
    request: () => ({ knowledgebaseId: this.knowledgebase()?.id, taskId: this.taskId() }),
    loader: ({ request }) => {
      return request?.taskId ? this.knowledgebaseAPI.getTask(request.knowledgebaseId, request.taskId) : null
    }
  })
  readonly documentIds = new SelectionModel<string>(true, [])
  readonly documents = computed(() => this.#taskResource.value()?.context?.documents?.filter((doc) => this.documentIds.isSelected(doc.id)))

  readonly files = model<KnowledgeFileUploader[]>([])

  // constructor() {
  //   effect(() => {
  //     console.log('taskid: ', this.taskId())
  //   })
  // }

  nextStep() {
    this.step.update((n) => n + 1)
  }

  previousStep() {
    this.step.update((n) => n - 1)
  }

  reloadTasks() {
    this.#taskResource.reload()
  }
}
