import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, effect, inject, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatProgressBarModule } from '@angular/material/progress-bar'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { CustomIconComponent } from '@cloud/app/@shared/avatar'
import { myRxResource, NgmI18nPipe, omitBlank } from '@metad/ocap-angular/core'
import { nonNullable } from '@metad/ocap-core'
import { ContentLoaderModule } from '@ngneat/content-loader'
import { TranslateModule } from '@ngx-translate/core'
import { KnowledgeChunkComponent, KnowledgeLocalFileComponent, KnowledgeWebCrawlComponent } from 'apps/cloud/src/app/@shared/knowledge'
import {
  channelName,
  DocumentSourceProviderCategoryEnum,
  getErrorMessage,
  injectHelpWebsite,
  KBDocumentStatusEnum,
  KDocumentSourceType,
  KnowledgebaseChannel,
  KnowledgebaseService,
  KnowledgeFileUploader,
  STATE_VARIABLE_HUMAN,
  ToastrService,
  XpertAgentService
} from '../../../../../../../@core'
import { KnowledgebaseComponent } from '../../../knowledgebase.component'
import { KnowledgeDocumentsComponent } from '../../documents.component'
import { KnowledgeDocumentPipelineComponent } from '../pipeline.component'

@Component({
  standalone: true,
  selector: 'xp-knowledge-document-pipeline-step-1',
  templateUrl: './step.component.html',
  styleUrls: ['./step.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    RouterModule,
    CdkMenuModule,
    CdkListboxModule,
    MatTooltipModule,
    MatProgressBarModule,
    ContentLoaderModule,
    NgmI18nPipe,
    CustomIconComponent,
    KnowledgeChunkComponent,
    KnowledgeLocalFileComponent,
    KnowledgeWebCrawlComponent
  ]
})
export class KnowledgeDocumentPipelineStep1Component {
  eKDocumentSourceType = KDocumentSourceType
  eDocumentSourceProviderCategoryEnum = DocumentSourceProviderCategoryEnum

  readonly #toastr = inject(ToastrService)
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly agentAPI = inject(XpertAgentService)
  readonly knowledgebaseAPI = inject(KnowledgebaseService)
  readonly knowledgebaseComponent = inject(KnowledgebaseComponent)
  readonly documentsComponent = inject(KnowledgeDocumentsComponent)
  readonly pipelineComponent = inject(KnowledgeDocumentPipelineComponent)
  readonly website = injectHelpWebsite()

  readonly knowledgebase = this.knowledgebaseComponent.knowledgebase

  readonly parentId = this.pipelineComponent.parentId
  readonly knowledgebaseId = this.pipelineComponent.knowledgebaseId
  readonly pipeline = this.pipelineComponent.pipeline
  readonly sourceStrategies = this.pipelineComponent.sourceStrategies
  readonly strategies = this.pipelineComponent.strategies
  readonly sources = this.pipelineComponent.sources
  readonly selectedSource = this.pipelineComponent.selectedSource
  readonly integrationId = this.pipelineComponent.integrationId
  readonly integration = this.pipelineComponent.integration
  readonly integrations = this.pipelineComponent.integrations
  readonly selectedStrategy = this.pipelineComponent.selectedStrategy
  readonly providerCategory = this.pipelineComponent.providerCategory
  readonly selectedIntegration = this.pipelineComponent.selectedIntegration
  readonly taskId = this.pipelineComponent.taskId
  readonly documents = this.pipelineComponent.documents
  readonly files = this.pipelineComponent.files
  readonly documentIds = this.pipelineComponent.documentIds

  // local files
  readonly createFileTask = myRxResource({
    request: () => ({
      taskId: this.taskId(),
      files: this.files()
        .map((file) => file.document())
        .filter(nonNullable)
    }),
    loader: ({ request }) => {
      return request.files.length > 0
        ? this.knowledgebaseAPI.createTask(
            this.knowledgebaseId(),
            omitBlank({
              id: request.taskId,
              context: {
                documents: request.files.map((file) => ({
                  ...file,
                  status: KBDocumentStatusEnum.WAITED,
                  parent: this.parentId() ? { id: this.parentId() } : null,
                }))
              }
            })
          )
        : null
    }
  })
  readonly selectedFile = model<KnowledgeFileUploader | null>(null)

  // Web Crawl
  readonly selectedWebDocument = model<any | null>(null)

  // Preview
  // readonly preview = signal<boolean>(true)
  readonly testing = signal<boolean>(false)

  constructor() {
    effect(
      () => {
        if (this.createFileTask.value()) {
          this.taskId.set(this.createFileTask.value().id)
          this.documentIds.set(this.createFileTask.value().context?.documents?.map((doc) => doc.id) ?? [])
        }
      },
      { allowSignalWrites: true }
    )
  }

  closePreview() {
    this.selectedFile.set(null)
  }

  openIntegrations() {
    window.open('/settings/integration', '_blank')
  }

  nextStep() {
    this.pipelineComponent.nextStep()
  }

  runStep() {
    this.testing.set(true)
    this.agentAPI
      .test(this.pipeline().id, this.selectedSource().key, {
        [STATE_VARIABLE_HUMAN]: {
          input: `Hi there`
        },
        [KnowledgebaseChannel]: {
          knowledgebaseId: this.knowledgebase()?.id,
          task_id: this.taskId(),
          stage: 'preview'
        }
      })
      .subscribe({
        next: (results) => {
          this.testing.set(false)
          this.taskId.set(results['knowledgebase_channel'].task_id)
          const channel = channelName(this.selectedSource().key)
          this.pipelineComponent.documentIds.set(results[channel]?.documents ?? [])
          console.log('Test results: ', results)
          this.#toastr.success('XPERT.Agent.TestSuccessfully')
        },
        error: (err) => {
          this.testing.set(false)
          console.error(err)
          this.#toastr.danger(getErrorMessage(err), 'XPERT.Agent.TestFailed')
        }
      })
  }
}
