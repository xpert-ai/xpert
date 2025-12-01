import { Component, computed, ElementRef, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatSliderModule } from '@angular/material/slider'
import { MatTooltipModule } from '@angular/material/tooltip'
import {
  injectToastr,
  IWFNCode,
  IWorkflowNode,
  TSelectOption,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum,
  XpertParameterTypeEnum,
  XpertAPIService
} from '@cloud/app/@core'
import { StateVariableSelectComponent } from '@cloud/app/@shared/agent'
import { NgmSelectComponent } from '@cloud/app/@shared/common'
import { XpertWorkflowErrorHandlingComponent } from '@cloud/app/@shared/workflow'
import { XpertWorkflowCodeEditorComponent } from '@cloud/app/@shared/xpert'
import { NgmSlideToggleComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { XpertStudioApiService } from '../../../domain'
import { XpertStudioComponent } from '../../../studio.component'
import { XpertWorkflowBaseComponent } from '../workflow-base.component'

@Component({
  selector: 'xpert-studio-panel-workflow-code',
  templateUrl: './code.component.html',
  styleUrls: ['./code.component.scss'],
  standalone: true,
  imports: [
    FormsModule,
    MatTooltipModule,
    TranslateModule,
    MatSliderModule,
    XpertWorkflowCodeEditorComponent,
    NgmSelectComponent,
    NgmSlideToggleComponent,
    XpertWorkflowErrorHandlingComponent,
    StateVariableSelectComponent
  ],
  host: {
    tabindex: '-1'
  }
})
export class XpertStudioPanelWorkflowCodeComponent extends XpertWorkflowBaseComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum

  readonly elementRef = inject(ElementRef)
  readonly xpertStudioComponent = inject(XpertStudioComponent)
  readonly studioService = inject(XpertStudioApiService)
  readonly xpertService = inject(XpertAPIService)
  readonly #toastr = injectToastr()

  // Inputs
  readonly wfNode = input<IWorkflowNode>()

  // States
  readonly workspaceId = computed(() => this.xpert()?.workspaceId)
  readonly entity = computed(() => this.wfNode() as IWFNCode)
  readonly inputs = computed(() => this.entity()?.inputs)
  readonly outputs = computed(() => this.entity()?.outputs)
  readonly retry = computed(() => this.entity()?.retry)
  readonly enabledRetry = computed(() => this.retry()?.enabled)
  readonly stopAfterAttempt = computed(() => this.retry()?.stopAfterAttempt)
  readonly retryInterval = computed(() => this.retry()?.retryInterval)
  readonly errorHandling = computed(() => this.entity()?.errorHandling)
  readonly errorHType = computed(() => this.errorHandling()?.type)

  get language() {
    return this.entity()?.language ?? 'javascript'
  }
  set language(value) {
    this.updateEntity('language', value)
  }

  get code() {
    return this.entity()?.code
  }
  set code(value) {
    this.updateEntity('code', value)
  }

  readonly OutputSelectOptions: TSelectOption[] = [
    {
      value: XpertParameterTypeEnum.STRING,
      label: {
        en_US: 'String',
        zh_Hans: '字符串'
      }
    },
    {
      value: XpertParameterTypeEnum.NUMBER,
      label: {
        en_US: 'Number',
        zh_Hans: '数字'
      }
    },
    {
      value: XpertParameterTypeEnum.BOOLEAN,
      label: {
        en_US: 'Boolean',
        zh_Hans: '布尔值'
      }
    },
    {
      value: XpertParameterTypeEnum.OBJECT,
      label: {
        en_US: 'Object',
        zh_Hans: '对象'
      }
    },
    {
      value: XpertParameterTypeEnum.ARRAY,
      label: {
        en_US: 'Object[]',
        zh_Hans: '对象数组'
      }
    },
    {
      value: XpertParameterTypeEnum.ARRAY_STRING,
      label: {
        en_US: 'String[]',
        zh_Hans: '字符串数组'
      }
    },
    {
      value: XpertParameterTypeEnum.ARRAY_NUMBER,
      label: {
        en_US: 'Number[]',
        zh_Hans: '数字数组'
      }
    },
    {
      value: XpertParameterTypeEnum.ARRAY_FILE,
      label: {
        en_US: 'File[]',
        zh_Hans: '文件数组'
      }
    }
  ]

  updateEntity(name: string, value: string | number | any) {
    const entity = { ...(this.entity() ?? {}) } as IWFNCode
    entity[name] = value
    this.studioService.updateBlock(this.key(), { entity })
  }

  addInput() {
    const inputs = this.inputs() ?? []
    inputs.push({ name: 'arg' + (inputs.length + 1) })
    this.updateEntity('inputs', [...inputs])
  }

  removeInput(param) {
    const inputs = this.inputs() ?? []
    this.updateEntity(
      'inputs',
      inputs.filter((item) => item.name !== param.name)
    )
  }

  updateInput(index: number, name: string, value: string) {
    const inputs = this.inputs() ?? []
    if (index > -1) {
      inputs[index] = {
        ...inputs[index],
        [name]: value
      }
      this.updateEntity('inputs', [...inputs])
    }
  }

  addOutput() {
    const outputs = this.outputs() ?? []
    outputs.push({ name: 'result' + (outputs.length + 1), type: XpertParameterTypeEnum.STRING })
    this.updateEntity('outputs', [...outputs])
  }

  removeOutput(index: number) {
    const outputs = this.outputs() ?? []
    outputs.splice(index, 1)
    this.updateEntity('outputs', [...outputs])
  }

  updateOutput(index: number, name: string, value: string) {
    const outputs = this.outputs() ?? []
    if (index > -1) {
      outputs[index] = {
        ...outputs[index],
        [name]: value
      }
      this.updateEntity('outputs', [...outputs])
    }
  }

  updateRetry(value: Partial<IWFNCode['retry']>) {
    const retry = this.retry() ?? {}
    this.updateEntity('retry', { ...retry, ...value })
  }
}
