import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { BehaviorSubject } from 'rxjs'
import {
  getErrorMessage,
  KDocumentSourceType,
  KnowledgebaseService,
  ToastrService,
  XpertAgentService
} from '../../../../../../../@core'
import { KnowledgebaseComponent } from '../../../knowledgebase.component'
import { KnowledgeDocumentsComponent } from '../../documents.component'
import { KnowledgeDocumentPipelineComponent } from '../pipeline.component'
import { ContentLoaderModule } from '@ngneat/content-loader'
import { KnowledgeDocumentPipelineSettingsComponent } from '../settings/settings.component'

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
    KnowledgeDocumentPipelineSettingsComponent
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
  
  readonly selectedSource = this.pipelineComponent.selectedSource
  readonly taskId = this.pipelineComponent.taskId
  readonly documentIds = this.pipelineComponent.documentIds
  readonly documents = this.pipelineComponent.documents
  readonly files = this.pipelineComponent.files

  readonly refresh$ = new BehaviorSubject<boolean>(true)
  readonly loading = signal(false)
  

  
  readonly parametersValue = model<Partial<Record<string, unknown>>>({})


  previousStep() {
    this.pipelineComponent.previousStep()
  }

  saveAndProcess() {
    this.kbAPI
      .processTask(this.knowledgebase().id, this.taskId(), {
        sources: {
          [this.selectedSource().key]: {
            documents: this.documentIds.selected
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
}
