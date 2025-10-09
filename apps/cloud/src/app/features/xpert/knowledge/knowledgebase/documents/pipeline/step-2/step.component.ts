import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { XpertParametersFormComponent } from '@cloud/app/@shared/xpert'
import { TranslateModule } from '@ngx-translate/core'
import { BehaviorSubject, Subscription } from 'rxjs'
import {
  getErrorMessage,
  IKnowledgebaseTask,
  KDocumentSourceType,
  KnowledgebaseService,
  KnowledgeFileUploader,
  ToastrService,
  XpertAgentService
} from '../../../../../../../@core'
import { KnowledgebaseComponent } from '../../../knowledgebase.component'
import { KnowledgeDocumentsComponent } from '../../documents.component'
import { KnowledgeDocumentPipelineComponent } from '../pipeline.component'
import { ContentLoaderModule } from '@ngneat/content-loader'
import { KnowledgeChunkComponent } from '@cloud/app/@shared/knowledge'

@Component({
  standalone: true,
  selector: 'xp-knowledge-document-pipeline-step-2',
  templateUrl: './step.component.html',
  styleUrls: ['./step.component.scss'],
  imports: [
    CommonModule,
    RouterModule,
    CdkMenuModule,
    FormsModule,
    TranslateModule,
    MatTooltipModule,
    ContentLoaderModule,
    XpertParametersFormComponent,
    KnowledgeChunkComponent
  ]
})
export class KnowledgeDocumentPipelineStep2Component {
  eKDocumentSourceType = KDocumentSourceType

  readonly #toastr = inject(ToastrService)
  readonly kbAPI = inject(KnowledgebaseService)
  readonly agentAPI = inject(XpertAgentService)
  readonly knowledgebaseComponent = inject(KnowledgebaseComponent)
  readonly documentsComponent = inject(KnowledgeDocumentsComponent)
  readonly pipelineComponent = inject(KnowledgeDocumentPipelineComponent)

  readonly knowledgebase = this.knowledgebaseComponent.knowledgebase
  readonly pipeline = this.pipelineComponent.pipeline
  readonly parameters = computed(() => this.pipeline()?.agentConfig?.parameters)
  readonly selectedSource = this.pipelineComponent.selectedSource
  readonly taskId = this.pipelineComponent.taskId
  readonly documentIds = this.pipelineComponent.documentIds
  readonly documents = this.pipelineComponent.documents
  readonly files = this.pipelineComponent.files

  readonly refresh$ = new BehaviorSubject<boolean>(true)
  readonly loading = signal(false)
  readonly previewing = signal(false)
  readonly task = signal<IKnowledgebaseTask>(null)
  readonly _documents = computed(() => this.task()?.context?.documents)
  private previewSub: Subscription
  readonly previewDocName = signal('')
  readonly previewDocChunks = computed(() => {
    const docs = this._documents()
    if (!docs?.length) {
      return []
    }
    if (this.previewDocName()) {
      return docs.find(d => d.name === this.previewDocName())?.chunks || []
    }
    return docs[0]?.chunks || []
  })

  // Models
  readonly parametersValue = model<Partial<Record<string, unknown>>>({})

  constructor() {
    effect(() => {
      if (!this.previewDocName() && this.files()?.length) {
        this.previewDocName.set(this.files()[0].file.name)
      }
    }, { allowSignalWrites: true })
  }

  previousStep() {
    this.pipelineComponent.previousStep()
  }

  selectFilePreview(file: KnowledgeFileUploader) {
    this.previewDocName.set(file.document().name)
    this.previewChunks()
  }

  saveAndProcess() {
    this.kbAPI
      .processTask(this.knowledgebase().id, this.taskId(), {
        sources: {
          [this.selectedSource().key]: {
            documents: this.documentIds()
          }
        },
        stage: 'prod'
      })
      .subscribe({
        next: (task) => {
          this.pipelineComponent.nextStep()
        },
        error: (err) => {
          this.#toastr.error(getErrorMessage(err))
        }
      })
  }

  previewChunks() {
    this.previewing.set(true)
    this.kbAPI
      .processTask(this.knowledgebase().id, this.taskId(), {
        sources: {
          [this.selectedSource().key]: {
            documents: this.documentIds()
          }
        },
        stage: 'preview'
      })
      .subscribe({
        next: (task) => {
          this.previewSub = this.kbAPI.pollTaskStatus(this.knowledgebase().id, this.taskId())
            .subscribe({
              next: (res) => {
                if (res.status === 'success') {
                  this.previewing.set(false)
                  this.task.set(res)
                  console.log(this._documents())
                }
              },
              error: (err) => {
                this.previewing.set(false)
                this.#toastr.error(getErrorMessage(err))
              }
            })

        },
        error: (err) => {
          this.#toastr.error(getErrorMessage(err))
        }
      })
  }
}
