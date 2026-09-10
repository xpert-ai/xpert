import { CdkMenuModule } from '@angular/cdk/menu'

import { Component, computed, effect, inject, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { BehaviorSubject, finalize } from 'rxjs'
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
import { ZardButtonComponent, ZardTooltipImports } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  selector: 'xp-knowledge-document-pipeline-step-2',
  templateUrl: './step.component.html',
  styleUrls: ['./step.component.scss'],
  imports: [
    ZardButtonComponent,
    RouterModule,
    CdkMenuModule,
    FormsModule,
    TranslateModule,
    ...ZardTooltipImports,
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
    if (this.loading()) return
    this.loading.set(true)
    this.pipelineComponent.submitting.set(true)
    if (this.pipelineComponent.dialogRef) this.pipelineComponent.dialogRef.disableClose = true
    this.kbAPI
      .processTask(this.knowledgebase().id, this.taskId(), {
        sources: {
          [this.selectedSource().key]: {
            documents: this.documentIds.selected
          }
        },
        stage: 'prod'
      })
      .pipe(
        finalize(() => {
          this.loading.set(false)
          this.pipelineComponent.submitting.set(false)
          if (this.pipelineComponent.dialogRef) this.pipelineComponent.dialogRef.disableClose = false
        })
      )
      .subscribe({
        next: (task) => {
          this.pipelineComponent.processed()
        },
        error: (err) => {
          this.#toastr.error(getErrorMessage(err))
        }
      })
  }
}
