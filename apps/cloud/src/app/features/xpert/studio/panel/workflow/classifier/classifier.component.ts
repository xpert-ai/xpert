import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { StateVariableSelectComponent } from '@cloud/app/@shared/agent'
import { CopilotModelSelectComponent, CopilotPromptEditorComponent } from '@cloud/app/@shared/copilot'
import { attrModel, linkedModel } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  AiModelTypeEnum,
  IWFNClassifier,
  IWorkflowNode,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum
} from 'apps/cloud/src/app/@core'
import { XpertStudioApiService } from '../../../domain'
import { XpertStudioComponent } from '../../../studio.component'
import { XpertWorkflowBaseComponent } from '../workflow-base.component'

@Component({
  selector: 'xpert-workflow-classifier',
  templateUrl: './classifier.component.html',
  styleUrls: ['./classifier.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    MatTooltipModule,
    TranslateModule,
    CopilotModelSelectComponent,
    StateVariableSelectComponent,
    CopilotPromptEditorComponent
  ],
  host: {
    tabindex: '-1'
  }
})
export class XpertWorkflowClassifierComponent extends XpertWorkflowBaseComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum
  eAiModelTypeEnum = AiModelTypeEnum

  readonly elementRef = inject(ElementRef)
  readonly xpertStudioComponent = inject(XpertStudioComponent)
  readonly studioService = inject(XpertStudioApiService)

  // Inputs
  readonly entity = input<IWorkflowNode>()

  // States
  readonly workspaceId = computed(() => this.xpert()?.workspaceId)
  readonly classifier = linkedModel({
    initialValue: null,
    compute: () => this.entity() as IWFNClassifier,
    update: (value) => {
      this.studioService.updateWorkflowNode(this.key(), (entity) => {
        return value
      })
    }
  })

  readonly copilotModel = attrModel(this.classifier, 'copilotModel')
  readonly inputVariable = linkedModel({
    initialValue: null,
    compute: () => this.classifier()?.inputVariables[0],
    update: (value) => {
      this.classifier.update((classifier) => {
        return {
          ...classifier,
          inputVariables: [value]
        }
      })
    }
  })

  readonly classes = attrModel(this.classifier, 'classes')
  readonly instruction = attrModel(this.classifier, 'instruction')

  readonly xpertCopilotModel = computed(() => this.xpert()?.copilotModel)

  readonly expandAdvanced = signal(false)
  readonly expandOutputVariables = signal(false)
  
  updateClass(i: number, value: string) {
    this.classes.update((classes) => {
      classes[i] = {
        ...classes[i],
        description: value
      }
      return [...classes]
    })
  }

  addClass() {
    this.classes.update((classes) => {
      classes.push({
        description: ''
      })
      return [...classes]
    })
  }

  removeClass(i: number) {
    this.classes.update((classes) => {
      classes.splice(i, 1)
      return [...classes]
    })
  }

  toggleAdvanced() {
    this.expandAdvanced.update((state) => !state)
  }

  toggleOutput() {
    this.expandOutputVariables.update((state) => !state)
  }
}
