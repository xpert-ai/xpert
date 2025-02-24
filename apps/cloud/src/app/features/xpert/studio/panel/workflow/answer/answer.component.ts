import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { TranslateModule } from '@ngx-translate/core'
import {
  getErrorMessage,
  injectToastr,
  IWFNAnswer,
  IWorkflowNode,
  TXpertTeamNode,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum,
  XpertService
} from 'apps/cloud/src/app/@core'
import { CopilotPromptEditorComponent } from 'apps/cloud/src/app/@shared/copilot'
import { derivedAsync } from 'ngxtension/derived-async'
import { catchError, of } from 'rxjs'
import { XpertStudioApiService } from '../../../domain'
import { XpertStudioComponent } from '../../../studio.component'

@Component({
  selector: 'xpert-studio-panel-workflow-answer',
  templateUrl: './answer.component.html',
  styleUrls: ['./answer.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatTooltipModule, TranslateModule, CopilotPromptEditorComponent],
  host: {
    tabindex: '-1'
  }
})
export class XpertStudioPanelWorkflowAnswerComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum

  readonly elementRef = inject(ElementRef)
  readonly xpertStudioComponent = inject(XpertStudioComponent)
  readonly studioService = inject(XpertStudioApiService)
  readonly xpertService = inject(XpertService)
  readonly #toastr = injectToastr()

  // Inputs
  readonly node = input<TXpertTeamNode>()
  readonly entity = input<IWorkflowNode>()

  // States
  readonly key = computed(() => this.node()?.key)
  readonly xpert = this.xpertStudioComponent.xpert
  readonly xpertId = computed(() => this.xpert()?.id)
  readonly workspaceId = computed(() => this.xpert()?.workspaceId)
  readonly answerEntity = computed(() => this.entity() as IWFNAnswer)
  readonly promptTemplate = computed(() => this.answerEntity()?.promptTemplate)

  // Fetch avaiable variables for this agent from server
  readonly variables = derivedAsync(() => {
    const xpertId = this.xpertId()
    const nodeKey = this.key()
    return xpertId && nodeKey
      ? this.xpertService.getWorkflowVariables(xpertId, nodeKey).pipe(
          catchError((error) => {
            this.#toastr.error(getErrorMessage(error))
            return of([])
          })
        )
      : of(null)
  })

  constructor() {
    // effect(() => console.log(this.variables()))
  }

  updateEntity(name: string, value: string | number) {
    const entity = { ...(this.answerEntity() ?? {}) } as IWFNAnswer
    entity[name] = value
    this.studioService.updateBlock(this.key(), { entity })
  }
}
