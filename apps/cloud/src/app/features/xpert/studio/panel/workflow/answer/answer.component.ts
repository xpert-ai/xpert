import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { MatTooltipModule } from '@angular/material/tooltip'
import { attrModel, linkedModel, NgmDensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  injectToastr,
  IWFNAnswer,
  IWorkflowNode,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum,
  XpertAPIService
} from 'apps/cloud/src/app/@core'
import { CopilotPromptEditorComponent } from 'apps/cloud/src/app/@shared/copilot'
import { XpertStudioApiService } from '../../../domain'
import { XpertStudioComponent } from '../../../studio.component'
import { XpertWorkflowBaseComponent } from '../workflow-base.component'

@Component({
  selector: 'xpert-studio-panel-workflow-answer',
  templateUrl: './answer.component.html',
  styleUrls: ['./answer.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatTooltipModule,
    MatSlideToggleModule,
    TranslateModule,
    NgmDensityDirective,
    CopilotPromptEditorComponent
  ],
  host: {
    tabindex: '-1'
  }
})
export class XpertStudioPanelWorkflowAnswerComponent extends XpertWorkflowBaseComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum

  readonly elementRef = inject(ElementRef)
  readonly xpertStudioComponent = inject(XpertStudioComponent)
  readonly studioService = inject(XpertStudioApiService)
  readonly xpertService = inject(XpertAPIService)
  readonly #toastr = injectToastr()

  // Inputs
  readonly entity = input<IWorkflowNode>()

  // States
  readonly workspaceId = computed(() => this.xpert()?.workspaceId)
  readonly answerEntity = linkedModel({
    initialValue: null,
    compute: () => this.entity() as IWFNAnswer,
    update: (value) => {
      this.studioService.updateWorkflowNode(this.key(), () => value)
    }
  })
  readonly promptTemplate = computed(() => this.answerEntity()?.promptTemplate)
  readonly mute = attrModel(this.answerEntity, 'mute')

  updateEntity(name: string, value: string | number) {
    this.studioService.updateWorkflowNode(this.key(), (state) => {
      const entity = { ...(state ?? {}) } as IWFNAnswer
      entity[name] = value
      return entity
    })
  }
}
