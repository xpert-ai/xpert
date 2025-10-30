import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal
} from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { KnowledgeLocalFileComponent } from '@cloud/app/@shared/knowledge'
import { XpertParametersFormComponent } from '@cloud/app/@shared/xpert'
import { NgmCheckboxComponent, NgmSpinComponent } from '@metad/ocap-angular/common'
import { attrModel, linkedModel, myRxResource, omitBlank } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  channelName,
  DocumentSourceProviderCategoryEnum,
  getErrorMessage,
  injectIntegrationAPI,
  IWFNSource,
  IWorkflowNode,
  KBDocumentStatusEnum,
  KnowledgebaseChannel,
  KnowledgebaseService,
  KnowledgeFileUploader,
  XpertAgentService
} from 'apps/cloud/src/app/@core'
import { nonNullable } from '@metad/core'
import { ContentLoaderModule } from '@ngneat/content-loader'
import { SelectionModel } from '@angular/cdk/collections'
import { XpertWorkflowBaseComponent } from '../workflow-base.component'

@Component({
  selector: 'xpert-workflow-source-test',
  templateUrl: './source.component.html',
  styleUrls: ['./source.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    CdkMenuModule,
    MatTooltipModule,
    TranslateModule,
    NgmSpinComponent,
    XpertParametersFormComponent,
    KnowledgeLocalFileComponent,
    ContentLoaderModule,
    NgmCheckboxComponent
  ]
})
export class XpertWorkflowSourceTestComponent extends XpertWorkflowBaseComponent {
  eDocumentSourceProviderCategoryEnum = DocumentSourceProviderCategoryEnum

  readonly integrationAPI = injectIntegrationAPI()
  readonly agentAPI = inject(XpertAgentService)
  readonly knowledgebaseAPI = inject(KnowledgebaseService)

  // Inputs
  readonly entity = input<IWorkflowNode>()

  // outputs
  readonly closed = output()

  // States
  readonly workspaceId = computed(() => this.xpert()?.workspaceId)
  readonly source = linkedModel({
    initialValue: null,
    compute: () => this.entity() as IWFNSource,
    update: (value) => {
      this.studioService.updateWorkflowNode(this.key(), (entity) => {
        return value
      })
    }
  })

  readonly provider = attrModel(this.source, 'provider')
  readonly integrationId = attrModel(this.source, 'integrationId')
  readonly parameters = attrModel(this.source, 'parameters')
  readonly config = attrModel(this.source, 'config')
  readonly acceptedFileTypes = computed(() => this.config()?.fileExtensions?.filter(Boolean).map((ext) => `.${ext}`))
  readonly parameterValue = model<Record<string, unknown>>()

  readonly pristineXpert = this.studioService.team
  readonly knowledgebase = computed(() => this.pristineXpert()?.knowledgebase)
  readonly knowledgebaseId = computed(() => this.knowledgebase()?.id)
  readonly taskId = signal<string>(null)
  readonly #taskResource = myRxResource({
    request: () => ({ knowledgebaseId: this.knowledgebase()?.id, taskId: this.taskId() }),
    loader: ({ request }) => {
      return request?.taskId ? this.knowledgebaseAPI.getTask(request.knowledgebaseId, request.taskId) : null
    }
  })
  readonly documentIds = new SelectionModel<string>(true, [])
  readonly documents = computed(
    () => this.#taskResource.value()?.context?.documents?.filter((doc) => this.documentIds?.isSelected(doc.id)) || []
  )

  readonly testing = signal(false)

  readonly busing = computed(() => this.testing() || this.#taskResource.status() === 'loading')

  readonly strategies = toSignal(this.knowledgebaseAPI.documentSourceStrategies$)
  readonly selectedStrategy = computed(() => this.strategies()?.find((s) => s.meta.name === this.provider()))
  readonly providerCategory = computed(() => this.selectedStrategy()?.meta.category)

  // Files model
  readonly files = model<KnowledgeFileUploader[]>([])
  readonly selectedFile = model<KnowledgeFileUploader | null>(null)
  
  readonly successMessage = signal<string>(null)

  run() {
    switch (this.providerCategory()) {
      case DocumentSourceProviderCategoryEnum.LocalFile: {
        this.createFilesTask()
        break
      }
      default: {
        this.test()
        break
      }
    }
  }

  test() {
    this.testing.set(true)
    this.agentAPI
      .test(this.xpert().id, this.key(), {
        [KnowledgebaseChannel]: {
          knowledgebaseId: this.knowledgebase()?.id
        },
        [channelName(this.key())]: {
          ...(this.parameterValue() ?? {}),
        }
      })
      .subscribe({
        next: (results) => {
          this.testing.set(false)
          this.taskId.set(results[KnowledgebaseChannel].task_id)
          const channel = channelName(this.key())
          this.setDocumentIds(results[channel]?.documents?.map((doc) => doc.id) ?? [])
        },
        error: (err) => {
          this.testing.set(false)
          console.error(err)
          this._toastr.danger(getErrorMessage(err))
        }
      })
  }

  createFilesTask() {
    this.testing.set(true)
    this.knowledgebaseAPI.createTask(
      this.knowledgebaseId(),
      omitBlank({
        context: {
          documents: this.files()
                  .map((file) => file.document())
                  .filter(nonNullable).map((file) => ({
                    ...file,
                    status: KBDocumentStatusEnum.WAITING,
                  }))
        }
      })
    ).subscribe({
      next: (task) => {
        this.testing.set(false)
        this.taskId.set(task.id)
        this.setDocumentIds(task.context?.documents?.map((doc) => doc.id) ?? [])
        this.successMessage.set(null)
      },
      error: (err) => {
        this.testing.set(false)
        console.error(err)
        this._toastr.danger(getErrorMessage(err))
      }
    })
  }

  start() {
    this.knowledgebaseAPI
      .processTask(this.knowledgebase().id, this.taskId(), {
        sources: {
          [this.key()]: {
            documents: this.documentIds.selected
          }
        },
        stage: 'preview',
        isDraft: true
      })
      .subscribe({
        next: (task) => {
          // console.log(task)
          this.successMessage.set(this.i18nService.instant('PAC.Pipeline.SourceTestSuccessMessage', {
            Default: `Added to background task, please check the message detailed log in chat history.`
          }))
        },
        error: (err) => {
          this._toastr.error(getErrorMessage(err))
        }
      })
  }

  close() {
    this.closed.emit()
    this.testing.set(false)
    this.taskId.set(null)
    this.documentIds.clear()
  }

  setDocumentIds(ids: string[]) {
    this.documentIds.clear()
    this.documentIds.setSelection(...ids)
  }
}
