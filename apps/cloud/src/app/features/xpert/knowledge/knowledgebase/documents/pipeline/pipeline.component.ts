import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { myRxResource, NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { injectQueryParams } from 'ngxtension/inject-query-params'
import { BehaviorSubject } from 'rxjs'
import {
  DocumentSourceProviderCategoryEnum,
  injectIntegrationAPI,
  IWFNSource,
  KDocumentSourceType,
  KnowledgebaseService,
  StorageFileService,
  ToastrService,
  TXpertTeamNode,
  WorkflowNodeTypeEnum
} from '../../../../../../@core'
import { KnowledgebaseComponent } from '../../knowledgebase.component'
import { KnowledgeDocumentsComponent } from '../documents.component'
import { CustomIconComponent } from '@cloud/app/@shared/avatar'
import { KnowledgeLocalFileComponent, KnowledgeWebCrawlComponent } from '@cloud/app/@shared/knowledge'

@Component({
  standalone: true,
  selector: 'xp-knowledge-document-pipeline',
  templateUrl: './pipeline.component.html',
  styleUrls: ['./pipeline.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    CdkMenuModule,
    MatTooltipModule,
    RouterModule,
    NgmI18nPipe,
    CustomIconComponent,
    KnowledgeLocalFileComponent,
    KnowledgeWebCrawlComponent
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

  readonly step = signal(0)

  readonly #pipeline = toSignal(
    this.knowledgebaseAPI.getOneById(this.knowledgebaseComponent.paramId(), {
      relations: ['pipeline'],
      select: ['id', 'name']
    })
  )

  readonly pipeline = computed(() => this.#pipeline()?.pipeline)
  readonly graph = computed(() => this.pipeline()?.graph)
  readonly sources = computed(() =>
    this.graph()?.nodes.filter((node) => node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.SOURCE)
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

  readonly selectedSource = signal<TXpertTeamNode>(null)
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

  readonly integrationId = signal<string>(null)

  constructor() {
    effect(() => {
      console.log(this.sourceStrategies(), this.strategies(), this.sources())
    })
  }

  openIntegrations() {
    window.open('/settings/integration', '_blank')
  }

}
