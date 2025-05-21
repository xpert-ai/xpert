import { CdkMenuModule } from '@angular/cdk/menu'
import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { StateVariableSelectComponent } from '@cloud/app/@shared/agent'
import { KnowledgeRecallParamsComponent } from '@cloud/app/@shared/knowledge'
import { attrModel, linkedModel } from '@metad/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  getErrorMessage,
  IWFNSubflow,
  IWorkflowNode,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum,
  XpertService
} from 'apps/cloud/src/app/@core'
import { XpertStudioApiService } from '../../../domain'
import { XpertStudioComponent } from '../../../studio.component'
import { XpertWorkflowBaseComponent } from '../workflow-base.component'
import { derivedAsync } from 'ngxtension/derived-async'
import { catchError, of } from 'rxjs'

@Component({
  selector: 'xpert-workflow-subflow',
  templateUrl: './subflow.component.html',
  styleUrls: ['./subflow.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatTooltipModule, TranslateModule, CdkMenuModule, StateVariableSelectComponent],
  host: {
    tabindex: '-1'
  }
})
export class XpertWorkflowSubflowComponent extends XpertWorkflowBaseComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum

  readonly elementRef = inject(ElementRef)
  readonly xpertStudioComponent = inject(XpertStudioComponent)
  readonly studioService = inject(XpertStudioApiService)
  readonly xpertService = inject(XpertService)

  // Inputs
  readonly entity = input<IWorkflowNode>()

  // States
  readonly workspaceId = computed(() => this.xpert()?.workspaceId)
  readonly subflow = linkedModel({
    initialValue: null,
    compute: () => this.entity() as IWFNSubflow,
    update: (value) => {
      this.studioService.updateWorkflowNode(this.key(), (entity) => {
        return value
      })
    }
  })

  readonly inputs = attrModel(this.subflow, 'inputs')
  readonly outputs = attrModel(this.subflow, 'outputs')

  readonly draft = this.studioService.viewModel

  readonly subAgentKey = computed(() => {
    return this.draft()?.connections.find((_) => _.type === 'agent' && _.from === this.subflow()?.key)?.to
  })

  readonly subVariables = derivedAsync(() => {
    const xpertId = this.xpertId()
    const nodeKey = this.subAgentKey()
    return xpertId && nodeKey
      ? this.studioService.getVariables({xpertId, agentKey: nodeKey, type: 'output'}).pipe(
          catchError((error) => {
            this._toastr.error(getErrorMessage(error))
            return of([])
          })
        )
      : of(null)
  })

  constructor() {
    super()

    effect(() => {
      console.log(this.subAgentKey())
    })
  }
 
  addInput() {
    this.inputs.update((state) => {
      return [...(state ?? []), {name: 'arg' + ((state?.length ?? 0) + 1)}]
    })
  }

  updateInput(index: number, name: string, value: string) {
    this.inputs.update((state) => {
      state[index] = {
        ...state[index],
        [name]: value
      }
      return [...state]
    })
  }

  removeInput(index: number) {
    this.inputs.update((state) => {
      state.splice(index, 1)
      return [...state]
    })
  }

  addOutput() {
    this.outputs.update((state) => {
      return [...(state ?? []), {name: 'result' + ((state?.length ?? 0) + 1)}]
    })
  }

  updateOutput(index: number, name: string, value: string) {
    this.outputs.update((state) => {
      state[index] = {
        ...state[index],
        [name]: value
      }
      return [...state]
    })
  }

  removeOutput(index: number) {
    this.outputs.update((state) => {
      state.splice(index, 1)
      return [...state]
    })
  }
}
