import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import {
  genXpertStartKey,
  getVariableSchema,
  injectToastr,
  IteratorIndexParameterName,
  IteratorItemParameterName,
  IWFNIterator,
  IWorkflowNode,
  TXpertTeamNode,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum,
  XpertAPIService
} from '@cloud/app/@core'
import { StateVariableSelectComponent, TXpertVariablesOptions } from '@cloud/app/@shared/agent'
import { NgmSelectComponent } from '@cloud/app/@shared/common'
import { TSelectOption } from '@xpert-ai/ocap-angular/core'
import { attrModel, linkedModel } from '@xpert-ai/core'
import { TranslateModule } from '@ngx-translate/core'
import { XpertStudioApiService } from '../../../domain'
import { XpertStudioComponent } from '../../../studio.component'
import { XpertWorkflowBaseComponent } from '../workflow-base.component'
import { ZardSliderComponent, ZardSwitchComponent, ZardTooltipImports } from '@xpert-ai/headless-ui'
import type { ZardSliderValue } from '@xpert-ai/headless-ui'
@Component({
  selector: 'xpert-studio-panel-workflow-iterator',
  templateUrl: './iterator.component.html',
  styleUrls: ['./iterator.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    ...ZardTooltipImports,
    TranslateModule,
    NgmSelectComponent,
    StateVariableSelectComponent,
    ZardSliderComponent,
    ZardSwitchComponent
  ],
  host: {
    tabindex: '-1'
  }
})
export class XpertStudioPanelWorkflowIteratorComponent extends XpertWorkflowBaseComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum

  readonly elementRef = inject(ElementRef)
  readonly xpertStudioComponent = inject(XpertStudioComponent)
  readonly studioService = inject(XpertStudioApiService)
  readonly xpertService = inject(XpertAPIService)
  readonly #toastr = injectToastr()
  readonly ItemParmaName = IteratorIndexParameterName

  // Inputs
  readonly entity = input<IWorkflowNode>()

  // States
  readonly nodeKey = computed(() => this.node()?.key)
  readonly workspaceId = computed(() => this.xpert()?.workspaceId)
  readonly iteratingEntity = computed(() => this.entity() as IWFNIterator)
  readonly iterating = linkedModel({
    initialValue: null,
    compute: () => this.entity() as IWFNIterator,
    update: (value) => {
      this.studioService.updateWorkflowNode(this.key(), (entity) => {
        return value
      })
    }
  })
  readonly inputVariable = computed(() => this.iteratingEntity()?.inputVariable)
  readonly parallel = computed(() => this.iteratingEntity()?.parallel)
  readonly maximum = computed(() => this.iteratingEntity()?.maximum)
  readonly errorMode = computed(() => this.iteratingEntity()?.errorMode)

  readonly outputParams = attrModel(this.iterating, 'outputParams')

  readonly errorModeOptions: TSelectOption<IWFNIterator['errorMode']>[] = [
    {
      value: 'terminate',
      label: {
        en_US: 'Terminate on error',
        zh_Hans: '错误时终止'
      }
    },
    {
      value: 'ignore',
      label: {
        en_US: 'Ignore error and continue',
        zh_Hans: '忽略错误并继续'
      }
    },
    {
      value: 'remove',
      label: {
        en_US: 'Remove error output',
        zh_Hans: '移除错误输出'
      }
    }
  ]

  readonly draft = this.studioService.viewModel
  readonly subAgentKey = computed(() => {
    return this.draft()?.connections.find((_) => _.type === 'agent' && _.from === this.entity()?.key)?.to
  })
  readonly subAgent = computed(() => {
    return this.draft()?.nodes.find((_) => _.type === 'agent' && _.key === this.subAgentKey())
  })

  // readonly variables = model<TWorkflowVarGroup[]>()
  readonly inputVariableItem = computed(() => getVariableSchema(this.variables(), this.inputVariable()).variable?.item)

  readonly subXpertKey = computed(
    () => this.draft()?.connections.find((_) => _.type === 'xpert' && _.from === this.iteratingEntity()?.key)?.to
  )
  readonly subXpert = computed(
    () =>
      this.draft()?.nodes.find((_) => _.type === 'xpert' && _.key === this.subXpertKey()) as TXpertTeamNode & {
        type: 'xpert'
      }
  )
  readonly subXpertAgentKey = computed(() => this.subXpert()?.entity.agent?.key)

  readonly subVarOptions = computed<TXpertVariablesOptions>(() => {
    return {
      xpertId: this.subXpertKey() ?? this.xpertId(),
      workflowKey: genXpertStartKey(this.nodeKey()),
      type: 'output',
      environmentId: this.studioService.environmentId(),
      inputs: [this.nodeKey()],
      connections: this.connections()
    }
  })

  // System variables
  readonly SYSTEM_VARIABLES = [IteratorIndexParameterName, IteratorItemParameterName]

  constructor() {
    super()

    // effect(() => {
    //   console.log(this.inputVariableItem(), this.variables(), this.subVariables())
    // })
  }

  updateEntity(name: string, value: string | number) {
    this.studioService.updateWorkflowNode(this.key(), (entity) => {
      return {
        ...entity,
        [name]: value
      } as IWorkflowNode
    })
  }

  updateMaximum(value: ZardSliderValue) {
    this.updateEntity('maximum', this.sliderValue(value))
  }

  addOutput() {
    this.outputParams.update((params) => [...(params ?? []), { name: '', variable: '' }])
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

  updateOutputVar(index: number, value: string) {
    const type = value ? getVariableSchema(this.variables(), value).variable?.type : null
    this.outputParams.update((state) => {
      state[index] = {
        ...state[index],
        variable: value,
        type
      }
      return [...state]
    })
  }

  removeOutputParam(name: string) {
    this.outputParams.update((params) => {
      return params?.filter((_) => _.name !== name)
    })
  }

  private sliderValue(value: ZardSliderValue) {
    return typeof value === 'number' ? value : value[0]
  }
}
