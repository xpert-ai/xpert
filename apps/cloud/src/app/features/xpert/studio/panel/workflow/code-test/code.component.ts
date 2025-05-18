import { Component, computed, ElementRef, inject, input, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { TranslateModule } from '@ngx-translate/core'
import {
  getErrorMessage,
  injectToastr,
  IWFNCode,
  IWorkflowNode,
  TXpertTeamNode,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum,
  XpertAgentService,
} from '@cloud/app/@core'
import { NgxJsonViewerModule } from 'ngx-json-viewer'
import { Subscription } from 'rxjs'
import { CopyComponent } from '@cloud/app/@shared/common'
import { XpertStudioComponent } from '../../../studio.component'
import { XpertStudioApiService } from '../../../domain'


@Component({
  selector: 'xpert-workflow-code-test',
  templateUrl: './code.component.html',
  styleUrls: ['./code.component.scss'],
  standalone: true,
  imports: [FormsModule, MatTooltipModule, TranslateModule, NgxJsonViewerModule, CopyComponent],
})
export class XpertWorkflowCodeTestComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum

  readonly elementRef = inject(ElementRef)
  readonly xpertStudioComponent = inject(XpertStudioComponent)
  readonly studioService = inject(XpertStudioApiService)
  readonly agentService = inject(XpertAgentService)
  readonly #toastr = injectToastr()

  // Inputs
  readonly node = input<TXpertTeamNode>()
  readonly wfNode = input<IWorkflowNode>()

  // State
  readonly entity = computed(() => this.wfNode() as IWFNCode)
  readonly inputs = computed(() => this.entity()?.inputs)
  readonly xpert = this.studioService.xpert

  readonly parameters = signal({})
  readonly results = signal(null)
  readonly error = signal(null)
  
  readonly loading = signal(false)
  #subscription: Subscription = null

  updateParameter(name: string, value: string) {
    this.parameters.update((state) => ({...state, [name]: value}))
  }

  test() {
    this.loading.set(true)
    this.error.set(null)
    this.#subscription?.unsubscribe()
    this.#subscription = this.agentService.test(this.xpert().id, this.wfNode().key, this.parameters()).subscribe({
      next: (results) => {
        this.loading.set(false)
        this.results.set(results)
      },
      error: (err) => {
        this.loading.set(false)
        this.error.set(getErrorMessage(err))
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  stopTest() {
    this.loading.set(false)
    this.#subscription?.unsubscribe()
    this.#subscription = null
  }
}
