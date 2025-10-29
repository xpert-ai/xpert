import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, input, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import {
  getErrorMessage,
  IKnowledgebase,
  IKnowledgebaseTask,
  IKnowledgeDocument,
  IWFNSource,
  IXpert,
  KDocumentSourceType,
  KnowledgebaseService,
  ToastrService,
  TXpertTeamNode
} from '@cloud/app/@core'
import { KnowledgeChunkComponent } from '@cloud/app/@shared/knowledge'
import { XpertParametersFormComponent } from '@cloud/app/@shared/xpert'
import { ContentLoaderModule } from '@ngneat/content-loader'
import { TranslateModule } from '@ngx-translate/core'
import { Subscription } from 'rxjs'

@Component({
  standalone: true,
  selector: 'xp-knowledge-document-pipeline-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    CdkMenuModule,
    MatTooltipModule,
    ContentLoaderModule,
    XpertParametersFormComponent,
    KnowledgeChunkComponent
  ]
})
export class KnowledgeDocumentPipelineSettingsComponent {
  eKDocumentSourceType = KDocumentSourceType

  readonly kbAPI = inject(KnowledgebaseService)
  readonly #toastr = inject(ToastrService)

  // Inputs
  readonly knowledgebase = input<IKnowledgebase>()
  readonly pipeline = input<IXpert>()
  readonly taskId = input<string>()
  readonly selectedSource = input<TXpertTeamNode & { type: 'workflow'; entity: IWFNSource }>()
  readonly documents = model<Partial<IKnowledgeDocument>[]>()

  // Models
  readonly parametersValue = model<Partial<Record<string, unknown>>>({})

  // States
  readonly parameters = computed(() => this.pipeline()?.agentConfig?.parameters)
  readonly previewing = signal(false)
  readonly loading = signal(false)
  private previewSub: Subscription
  readonly previewDocName = signal('')
  readonly previewDocChunks = computed(() => {
    const docs = this._documents()
    if (!docs?.length) {
      return []
    }
    if (this.previewDocName()) {
      const doc = docs.find((d) => d.name === this.previewDocName())
      return doc?.draft.chunks || doc?.chunks || []
    }
    return docs[0]?.chunks || []
  })

  readonly task = signal<IKnowledgebaseTask>(null)
  readonly _documents = computed(() => this.task()?.context?.documents)

  constructor() {
    effect(() => {
      if (!this.previewDocName() && this.documents()?.length) {
        this.previewDocName.set(this.documents()[0].name)
      }
    }, { allowSignalWrites: true })
  }


  previewChunks() {
    this.previewing.set(true)
    this.kbAPI
      .processTask(this.knowledgebase().id, this.taskId(), {
        sources: {
          [this.selectedSource().key]: {
            documents: this.documents().map((d) => d.id)
          }
        },
        stage: 'preview'
      })
      .subscribe({
        next: (task) => {
          this.previewSub = this.kbAPI.pollTaskStatus(this.knowledgebase().id, this.taskId()).subscribe({
            next: (res) => {
              if (res.status === 'success') {
                this.previewing.set(false)
                this.task.set(res)
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
