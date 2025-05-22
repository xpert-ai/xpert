import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatSliderModule } from '@angular/material/slider'
import { MatTooltipModule } from '@angular/material/tooltip'
import {
  getErrorMessage,
  getVariableSchema,
  injectToastr,
  IWFNIterating,
  IWorkflowNode,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum,
  XpertService
} from '@cloud/app/@core'
import { StateVariableSelectComponent } from '@cloud/app/@shared/agent'
import { NgmSelectComponent } from '@cloud/app/@shared/common'
import { NgmSlideToggleComponent } from '@metad/ocap-angular/common'
import { NgmDensityDirective, TSelectOption } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { derivedAsync } from 'ngxtension/derived-async'
import { catchError, of } from 'rxjs'
import { XpertStudioApiService } from '../../../domain'
import { XpertStudioComponent } from '../../../studio.component'
import { XpertWorkflowBaseComponent } from '../workflow-base.component'
import { attrModel, linkedModel } from '@metad/core'

@Component({
  selector: 'xpert-studio-panel-workflow-iterating',
  templateUrl: './iterating.component.html',
  styleUrls: ['./iterating.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatTooltipModule,
    TranslateModule,
    MatSliderModule,
    NgmSlideToggleComponent,
    NgmDensityDirective,
    NgmSelectComponent,
    StateVariableSelectComponent
  ],
  host: {
    tabindex: '-1'
  }
})
export class XpertStudioPanelWorkflowIteratingComponent extends XpertWorkflowBaseComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum

  readonly elementRef = inject(ElementRef)
  readonly xpertStudioComponent = inject(XpertStudioComponent)
  readonly studioService = inject(XpertStudioApiService)
  readonly xpertService = inject(XpertService)
  readonly #toastr = injectToastr()

  // Inputs
  readonly entity = input<IWorkflowNode>()

  // States
  readonly workspaceId = computed(() => this.xpert()?.workspaceId)
  readonly iteratingEntity = computed(() => this.entity() as IWFNIterating)
  readonly iterating = linkedModel({
    initialValue: null,
    compute: () => this.entity() as IWFNIterating,
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
  
  readonly inputParams = attrModel(this.iterating, 'inputParams')
  readonly outputParams = attrModel(this.iterating, 'outputParams')

  readonly errorModeOptions: TSelectOption<IWFNIterating['errorMode']>[] = [
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
  readonly subVariables = derivedAsync(() => {
    const xpertId = this.xpertId()
    const nodeKey = this.subAgentKey()
    return xpertId && nodeKey
      ? this.studioService.getVariables({ xpertId, agentKey: nodeKey, type: 'output' }).pipe(
          catchError((error) => {
            this._toastr.error(getErrorMessage(error))
            return of([])
          })
        )
      : of(null)
  })

  readonly inputVariableItem = computed(() => getVariableSchema(this.variables(), this.inputVariable()).variable?.item)
  readonly restInputParams = computed(() => this.inputParams()?.filter((p) => !this.inputVariableItem()?.some((_) => _.name === p.name)))

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

  addInput() {
    this.inputParams.update((params) => [...(params ?? []), {name: '', variable: ''}])
  }

  getInputParam(name: string) {
    return this.inputParams()?.find((_) => _.name === name)?.variable
  }

  updateInputParam(name: string, variable: string) {
    this.inputParams.update((params) => {
      params ??= []
      const index = params?.findIndex((_) => _.name === name)
      if (index > -1) {
        params[index] = {
          name,
          variable
        }
      } else {
        params.push({
          name,
          variable
        })
      }
      return [...params]
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

  removeInputParam(name: string) {
    this.inputParams.update((params) => {
      return params?.filter((_) => _.name !== name)
    })
  }

  addOutput() {
    this.outputParams.update((params) => [...(params ?? []), {name: '', variable: ''}])
  }

  updateOutput(index: number, name: string, value: string) {
    this.outputParams.update((state) => {
      state[index] = {
        ...state[index],
        [name]: value,
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
}
