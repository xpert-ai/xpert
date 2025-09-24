import { CdkMenuModule } from '@angular/cdk/menu'
import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { StateVariableSelectComponent } from '@cloud/app/@shared/agent'
import { CodeEditorCardComponent } from '@cloud/app/@shared/editors'
import { attrModel, linkedModel } from '@metad/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  IWFNTemplate,
  IWorkflowNode,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum,
  XpertAPIService
} from 'apps/cloud/src/app/@core'
import { XpertStudioApiService } from '../../../domain'
import { XpertStudioComponent } from '../../../studio.component'
import { XpertWorkflowBaseComponent } from '../workflow-base.component'

@Component({
  selector: 'xpert-workflow-template',
  templateUrl: './template.component.html',
  styleUrls: ['./template.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatTooltipModule,
    TranslateModule,
    CdkMenuModule,
    StateVariableSelectComponent,
    CodeEditorCardComponent
  ],
  host: {
    tabindex: '-1'
  }
})
export class XpertWorkflowTemplateComponent extends XpertWorkflowBaseComponent {
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
  readonly template = linkedModel({
    initialValue: null,
    compute: () => this.entity() as IWFNTemplate,
    update: (value) => {
      this.studioService.updateWorkflowNode(this.key(), (entity) => {
        return value
      })
    }
  })

  readonly inputParams = attrModel(this.template, 'inputParams')
  readonly code = attrModel(this.template, 'code')

  readonly expandOutputVariables = signal(false)

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

  removeInput(index: number) {
    this.inputParams.update((state) => {
      state.splice(index, 1)
      return [...state]
    })
  }

  toggleOutput() {
    this.expandOutputVariables.update((state) => !state)
  }
}
