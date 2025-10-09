import { CdkMenuModule } from '@angular/cdk/menu'
import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { StateVariableSelectComponent, TXpertVariablesOptions } from '@cloud/app/@shared/agent'
import { attrModel, linkedModel } from '@metad/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  IWFNSubflow,
  IWorkflowNode,
  TXpertTeamNode,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum,
  XpertAPIService
} from 'apps/cloud/src/app/@core'
import { XpertStudioApiService } from '../../../domain'
import { XpertStudioComponent } from '../../../studio.component'
import { XpertWorkflowBaseComponent } from '../workflow-base.component'

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
  readonly xpertService = inject(XpertAPIService)

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

  readonly inputParams = attrModel(this.subflow, 'inputParams')
  readonly outputParams = attrModel(this.subflow, 'outputParams')

  readonly draft = this.studioService.viewModel

  readonly subAgentKey = computed(() => this.draft()?.connections.find((_) => _.type === 'agent' && _.from === this.subflow()?.key)?.to)
  readonly subXpertKey = computed(() => this.draft()?.connections.find((_) => _.type === 'xpert' && _.from === this.subflow()?.key)?.to)
  readonly subXpert = computed(() => this.draft()?.nodes.find((_) => _.type === 'xpert' && _.key === this.subXpertKey()) as TXpertTeamNode & {type: 'xpert'})
  readonly subXpertAgentKey = computed(() => this.subXpert()?.entity.agent?.key)

  readonly subVarInputOptions = computed<TXpertVariablesOptions>(() => {
    return {
      xpertId: this.subXpertKey() ?? this.xpertId(),
      agentKey: this.subXpertAgentKey() ?? this.subAgentKey(),
      type: 'input',
      environmentId: this.studioService.environmentId(),
      connections: this.connections()
    }
  })

  readonly subVarOutputOptions = computed<TXpertVariablesOptions>(() => {
    return {
      xpertId: this.subXpertKey() ?? this.xpertId(),
      agentKey: this.subXpertAgentKey() ?? this.subAgentKey(),
      type: 'output',
      isDraft: false,
      environmentId: this.studioService.environmentId(),
      connections: this.connections()
    }
  })


  addInput() {
    this.inputParams.update((state) => {
      return [...(state ?? []), { name: 'arg' + ((state?.length ?? 0) + 1) }]
    })
  }

  updateInput(index: number, name: string, value: string) {
    this.inputParams.update((state) => {
      state[index] = {
        ...state[index],
        [name]: value
      }
      return [...state]
    })
  }

  updateInputParamName(name: string, newName: string) {
    this.inputParams.update((params) => {
      params ??= []
      const index = params?.findIndex((_) => _.name === name)
      if (index > -1) {
        params[index] = {
          ...params[index],
          name: newName,
        }
      }
      return [...params]
    })
  }

  removeInput(index: number) {
    this.inputParams.update((state) => {
      state.splice(index, 1)
      return [...state]
    })
  }

  addOutput() {
    this.outputParams.update((state) => {
      return [...(state ?? []), { name: 'result' + ((state?.length ?? 0) + 1) }]
    })
  }

  updateOutput(index: number, name: string, value: string) {
    this.outputParams.update((state) => {
      state[index] = {
        ...state[index],
        [name]: value
      }
      return [...state]
    })
  }

  removeOutput(index: number) {
    this.outputParams.update((state) => {
      state.splice(index, 1)
      return [...state]
    })
  }
}
