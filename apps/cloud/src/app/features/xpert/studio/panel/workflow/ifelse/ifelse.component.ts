import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { TranslateModule } from '@ngx-translate/core'
import {
  getErrorMessage,
  injectToastr,
  IWFNIfElse,
  IWorkflowNode,
  TWFCase,
  TXpertTeamNode,
  uuid,
  WorkflowComparisonOperator,
  WorkflowLogicalOperator,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum,
  XpertAPIService
} from 'apps/cloud/src/app/@core'
import { XpertWorkflowCaseFormComponent } from 'apps/cloud/src/app/@shared/workflow'
import { derivedAsync } from 'ngxtension/derived-async'
import { catchError, of } from 'rxjs'
import { XpertStudioApiService } from '../../../domain'
import { XpertStudioComponent } from '../../../studio.component'
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop'
import { XpertWorkflowBaseComponent } from '../workflow-base.component'

@Component({
  selector: 'xpert-studio-panel-workflow-ifelse',
  templateUrl: './ifelse.component.html',
  styleUrls: ['./ifelse.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DragDropModule, MatTooltipModule, TranslateModule, XpertWorkflowCaseFormComponent],
  host: {
    tabindex: '-1'
  }
})
export class XpertStudioPanelWorkflowIfelseComponent extends XpertWorkflowBaseComponent {
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
  readonly ifElseEntity = computed(() => this.entity() as IWFNIfElse)
  readonly cases = computed(() => this.ifElseEntity()?.cases)

  addCase() {
    const entity: IWFNIfElse = {
      ...this.ifElseEntity(),
      cases: [
        ...(this.ifElseEntity().cases ?? []),
        {
          caseId: uuid(),
          conditions: [
            {
              id: uuid(),
              comparisonOperator: WorkflowComparisonOperator.CONTAINS
            }
          ],
          logicalOperator: WorkflowLogicalOperator.OR
        }
      ]
    }
    this.studioService.updateBlock(this.key(), { entity })
  }

  updateCase(index: number, value: TWFCase) {
    const node = this.ifElseEntity()
    node.cases[index] = value
    const entity: IWFNIfElse = {
      ...node,
      cases: [...node.cases]
    }
    this.studioService.updateBlock(this.key(), { entity })
  }

  remove(index: number) {
    const cases = [...(this.ifElseEntity().cases ?? [])]
    cases.splice(index, 1)
    const entity: IWFNIfElse = {
      ...this.ifElseEntity(),
      cases
    }
    this.studioService.updateBlock(this.key(), { entity })
  }

  drop(event: CdkDragDrop<string[]>) {
    const cases = [...(this.ifElseEntity().cases ?? [])]
    if (event.previousContainer === event.container) {
      moveItemInArray(cases, event.previousIndex, event.currentIndex)
      const entity: IWFNIfElse = {
        ...this.ifElseEntity(),
        cases
      }
      this.studioService.updateBlock(this.key(), { entity })
    } else {
      // transferArrayItem(
      //   event.previousContainer.data,
      //   event.container.data,
      //   event.previousIndex,
      //   event.currentIndex,
      // )
    }
  }
}
