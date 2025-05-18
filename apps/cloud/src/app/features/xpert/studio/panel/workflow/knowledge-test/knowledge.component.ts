import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import {
  getErrorMessage,
  injectToastr,
  IWorkflowNode,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum,
  XpertAgentService
} from '@cloud/app/@core'
import { CopyComponent } from '@cloud/app/@shared/common'
import { TranslateModule } from '@ngx-translate/core'
import { NgxJsonViewerModule } from 'ngx-json-viewer'
import { Subscription } from 'rxjs'
import { XpertStudioApiService } from '../../../domain'
import { XpertStudioComponent } from '../../../studio.component'
import { XpertWorkflowBaseComponent } from '../workflow-base.component'


@Component({
  selector: 'xpert-workflow-knowledge-test',
  templateUrl: './knowledge.component.html',
  styleUrls: ['./knowledge.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatTooltipModule, TranslateModule, CdkMenuModule, CopyComponent, NgxJsonViewerModule],
  host: {
    tabindex: '-1'
  }
})
export class XpertWorkflowKnowledgeTestComponent extends XpertWorkflowBaseComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum

  readonly elementRef = inject(ElementRef)
  readonly xpertStudioComponent = inject(XpertStudioComponent)
  readonly studioService = inject(XpertStudioApiService)
  readonly agentService = inject(XpertAgentService)
  readonly #dialog = inject(Dialog)
  readonly #toastr = injectToastr()

  // Inputs
  readonly entity = input<IWorkflowNode>()

  // States
  readonly workspaceId = computed(() => this.xpert()?.workspaceId)

  readonly query = model<string>()

  readonly results = signal(null)
  readonly error = signal(null)

  readonly loading = signal(false)
  #subscription: Subscription = null

  test() {
    this.loading.set(true)
    this.error.set(null)
    this.#subscription?.unsubscribe()
    this.#subscription = this.agentService.test(this.xpert().id, this.entity().key, { query: this.query() }).subscribe({
      next: (results) => {
        this.loading.set(false)
        this.results.set(results)
      },
      error: (err) => {
        this.loading.set(false)
        const error = getErrorMessage(err)
        this.error.set(error)
        this.#toastr.error(error)
      }
    })
  }

  stopTest() {
    this.loading.set(false)
    this.#subscription?.unsubscribe()
    this.#subscription = null
  }
}
