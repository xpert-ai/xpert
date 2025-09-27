import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { attrModel, linkedModel, myRxResource } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  channelName,
  getErrorMessage,
  injectIntegrationAPI,
  injectToastr,
  IWFNSource,
  IWorkflowNode,
  KnowledgebaseService,
  XpertAgentService
} from 'apps/cloud/src/app/@core'
import { XpertStudioApiService } from '../../../domain'
import { XpertWorkflowBaseComponent } from '../workflow-base.component'

@Component({
  selector: 'xpert-workflow-source-test',
  templateUrl: './source.component.html',
  styleUrls: ['./source.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, CdkMenuModule, MatTooltipModule, TranslateModule, NgmSpinComponent]
})
export class XpertWorkflowSourceTestComponent extends XpertWorkflowBaseComponent {
  readonly studioService = inject(XpertStudioApiService)
  readonly integrationAPI = injectIntegrationAPI()
  readonly agentAPI = inject(XpertAgentService)
  readonly knowledgebaseAPI = inject(KnowledgebaseService)
  readonly #toastr = injectToastr()

  // Inputs
  readonly entity = input<IWorkflowNode>()

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
  readonly config = attrModel(this.source, 'config')

  readonly pristineXpert = this.studioService.team
  readonly knowledgebase = computed(() => this.pristineXpert()?.knowledgebase)
  readonly taskId = signal<string>(null)
  readonly #taskResource = myRxResource({
    request: () => ({ knowledgebaseId: this.knowledgebase()?.id, taskId: this.taskId() }),
    loader: ({ request }) => {
      return request?.taskId ? this.knowledgebaseAPI.getTask(request.knowledgebaseId, request.taskId) : null
    }
  })
  readonly documentIds = signal<string[]>([])
  readonly documents = computed(() => this.#taskResource.value()?.context?.documents?.filter((doc) => this.documentIds()?.includes(doc.id)) || [])

  readonly testing = signal(false)

  readonly busing = computed(() => this.testing() || this.#taskResource.status() === 'loading')

  constructor() {
    super()
    effect(() => {
      console.log(this.documents())
    })
  }

  test() {
    this.testing.set(true)
    this.agentAPI
      .test(this.xpert().id, this.key(), {
        knowledgebaseId: this.knowledgebase()?.id
      })
      .subscribe({
        next: (results) => {
          this.testing.set(false)
          this.taskId.set(results['knowledgebase_channel'].task_id)
          const channel = channelName(this.key())
          this.documentIds.set(results[channel]?.documents ?? [])
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

  start() {}

  close() {
    this.closed.emit()
    this.testing.set(false)
    this.taskId.set(null)
    this.documentIds.set([])
  }
}
