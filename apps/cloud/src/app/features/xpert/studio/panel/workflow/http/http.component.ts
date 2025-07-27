import { Dialog } from '@angular/cdk/dialog'
import { Component, computed, ElementRef, inject, input, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { XpertVariableInputComponent } from '@cloud/app/@shared/agent'
import {
  XpertWorkflowAuthorizationComponent,
  XpertWorkflowErrorHandlingComponent,
  XpertWorkflowRetryComponent
} from '@cloud/app/@shared/workflow'
import { linkedModel } from '@metad/core'
import { NgmRadioSelectComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import {
  BodyType,
  injectToastr,
  IWFNHttp,
  IWorkflowNode,
  TSelectOption,
  TWorkflowVarGroup,
  TXpertParameter,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum,
  XpertParameterTypeEnum,
  XpertService
} from 'apps/cloud/src/app/@core'
import { NgmSelectComponent } from 'apps/cloud/src/app/@shared/common'
import { XpertStudioApiService } from '../../../domain'
import { XpertStudioComponent } from '../../../studio.component'
import { XpertWorkflowBaseComponent } from '../workflow-base.component'
import { CopilotPromptEditorComponent } from '@cloud/app/@shared/copilot'

@Component({
  standalone: true,
  selector: 'xpert-workflow-http',
  templateUrl: './http.component.html',
  imports: [
    FormsModule,
    MatTooltipModule,
    TranslateModule,
    NgmSelectComponent,
    NgmRadioSelectComponent,
    XpertVariableInputComponent,
    XpertWorkflowRetryComponent,
    XpertWorkflowErrorHandlingComponent,
    CopilotPromptEditorComponent
  ],
  host: {
    tabindex: '-1'
  }
})
export class XpertWorkflowHttpComponent extends XpertWorkflowBaseComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum

  readonly elementRef = inject(ElementRef)
  readonly xpertStudioComponent = inject(XpertStudioComponent)
  readonly studioService = inject(XpertStudioApiService)
  readonly xpertService = inject(XpertService)
  readonly #dialog = inject(Dialog)
  readonly #toastr = injectToastr()

  // Inputs
  readonly wfNode = input<IWorkflowNode>()

  // States
  readonly variables = model<TWorkflowVarGroup[]>()
  readonly workspaceId = computed(() => this.xpert()?.workspaceId)
  readonly entity = computed(() => this.wfNode() as IWFNHttp)

  readonly url = linkedModel({
    initialValue: null,
    compute: () => this.entity()?.url,
    update: (newValue, source) => {
      this.updateEntity('url', newValue)
    }
  })

  readonly authorization = linkedModel({
    initialValue: null,
    compute: () => this.entity()?.authorization,
    update: (newValue, source) => {
      this.updateEntity('authorization', newValue)
    }
  })

  readonly authType = computed(() => this.authorization()?.auth_type)

  readonly method = linkedModel({
    initialValue: null,
    compute: () => this.entity()?.method,
    update: (newValue) => {
      this.updateEntity('method', newValue)
    }
  })

  readonly #headers = linkedModel({
    initialValue: null,
    compute: () => this.entity()?.headers,
    update: (newValue) => {
      this.updateEntity('headers', newValue)
    }
  })

  readonly headers = computed(() => (this.#headers()?.length ? this.#headers() : [{ name: '', value: '' }]))

  readonly #params = linkedModel({
    initialValue: null,
    compute: () => this.entity()?.params,
    update: (newValue) => {
      this.updateEntity('params', newValue)
    }
  })

  readonly params = computed(() => (this.#params()?.length ? this.#params() : [{ key: '', value: '' }]))

  readonly #body = linkedModel({
    initialValue: null,
    compute: () => this.entity()?.body,
    update: (newValue) => {
      this.updateEntity('body', newValue)
    }
  })

  readonly bodyType = linkedModel({
    initialValue: null,
    compute: () => this.#body()?.type,
    update: (newValue) => {
      this.#body.update((state) => ({ ...(state ?? {}), type: newValue }))
    }
  })

  readonly #encodedForm = linkedModel({
    initialValue: null,
    compute: () => this.#body()?.encodedForm,
    update: (newValue) => {
      this.#body.update((state) => ({ ...(state ?? {}), encodedForm: newValue }))
    }
  })

  readonly encodedForm = computed(() => (this.#encodedForm()?.length ? this.#encodedForm() : [{ key: '', value: '' }]))

  readonly body = linkedModel({
    initialValue: null,
    compute: () => this.#body()?.body,
    update: (newValue) => {
      this.#body.update((state) => ({ ...(state ?? {}), body: newValue }))
    }
  })

  readonly connectionTimeout = linkedModel({
    initialValue: null,
    compute: () => this.entity()?.connectionTimeout,
    update: (newValue) => {
      this.updateEntity('connectionTimeout', newValue)
    }
  })

  readonly readTimeout = linkedModel({
    initialValue: null,
    compute: () => this.entity()?.readTimeout,
    update: (newValue) => {
      this.updateEntity('readTimeout', newValue)
    }
  })

  readonly writeTimeout = linkedModel({
    initialValue: null,
    compute: () => this.entity()?.writeTimeout,
    update: (newValue) => {
      this.updateEntity('writeTimeout', newValue)
    }
  })

  readonly retry = linkedModel({
    initialValue: null,
    compute: () => this.entity()?.retry,
    update: (newValue) => {
      this.updateEntity('retry', newValue)
    }
  })

  readonly errorHandling = linkedModel({
    initialValue: null,
    compute: () => this.entity()?.errorHandling,
    update: (newValue) => {
      this.updateEntity('errorHandling', newValue)
    }
  })

  readonly HttpOptions: TSelectOption<IWFNHttp['method']>[] = [
    {
      value: 'get',
      label: 'Get'
    },
    {
      value: 'post',
      label: 'Post'
    },
    {
      value: 'put',
      label: 'Put'
    },
    {
      value: 'delete',
      label: 'Delete'
    },
    {
      value: 'patch',
      label: 'Patch'
    },
    {
      value: 'head',
      label: 'Head'
    }
  ]

  readonly BodyTypeOptions: TSelectOption<BodyType>[] = [
    {
      value: 'none',
      label: 'None'
    },
    // {
    //   value: 'form-data',
    //   label: 'form-data'
    // },
    {
      value: 'x-www-form-urlencoded',
      label: 'x-www-form-urlencoded'
    },
    {
      value: 'json',
      label: 'JSON'
    },
    {
      value: 'raw',
      label: 'RAW'
    }
    // {
    //   value: 'binary',
    //   label: 'BINARY'
    // }
  ]

  readonly outputs = signal<TXpertParameter[]>([
    {
      type: XpertParameterTypeEnum.NUMBER,
      name: 'status_code',
      title: 'Status Code'
    },
    {
      type: XpertParameterTypeEnum.STRING,
      name: 'body',
      title: 'Body'
    },
    {
      type: XpertParameterTypeEnum.OBJECT,
      name: 'headers',
      title: 'Headers',
      item: []
    }
  ])

  readonly expandTimeout = signal(false)
  readonly expandOutputVariables = signal(false)

  updateEntity(name: string, value: string | number | any) {
    this.studioService.updateWorkflowNode(this.key(), (entity) => {
      entity[name] = value
      return entity as IWorkflowNode
    })
  }

  updateHeader(index: number, value) {
    this.#headers.update((state) => {
      state ??= []
      state[index] = {
        ...(state[index] ?? {}),
        ...value
      }
      return [...state]
    })
  }

  updateHeaderVal(index: number, value) {
    this.updateHeader(index, { value })
    if (index === this.headers().length - 1) {
      this.#headers.update((state) => [...state, { name: '', value: '' }])
    }
  }

  removeHeader(index: number) {
    this.#headers.update((state) => {
      state.splice(index, 1)
      return [...state]
    })
  }

  updateParam(index: number, value) {
    this.#params.update((state) => {
      state ??= []
      state[index] = {
        ...(state[index] ?? {}),
        ...value
      }
      return [...state]
    })
  }

  updateParamVal(index: number, value) {
    this.updateParam(index, { value })
    if (index === this.params().length - 1) {
      this.#params.update((state) => [...state, { key: '', value: '' }])
    }
  }

  removeParam(index: number) {
    this.#params.update((state) => {
      state.splice(index, 1)
      return [...state]
    })
  }

  updateEncodedForm(index: number, value) {
    this.#encodedForm.update((state) => {
      state ??= []
      state[index] = {
        ...(state[index] ?? {}),
        ...value
      }
      return [...state]
    })
  }

  updateEncodedFormVal(index: number, value) {
    this.updateEncodedForm(index, { value })
    if (index === this.encodedForm().length - 1) {
      this.#encodedForm.update((state) => [...state, { key: '', value: '' }])
    }
  }

  removeEncodedForm(index: number) {
    this.#encodedForm.update((state) => {
      state.splice(index, 1)
      return [...state]
    })
  }

  toggleTimeout() {
    this.expandTimeout.update((state) => !state)
  }

  toggleOutput() {
    this.expandOutputVariables.update((state) => !state)
  }

  openAuth() {
    this.#dialog
      .open(XpertWorkflowAuthorizationComponent, {
        data: {
          authorization: this.authorization(),
          varOptions: this.varOptions()
        }
      })
      .closed.subscribe({
        next: (authorization) => {
          if (authorization) {
            this.authorization.set(authorization)
          }
        }
      })
  }
}
