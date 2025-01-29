import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { MatTooltipModule } from '@angular/material/tooltip'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { NgmDensityDirective } from '@metad/ocap-angular/core'
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
  XpertService
} from 'apps/cloud/src/app/@core'
import { XpertWorkflowCaseFormComponent } from 'apps/cloud/src/app/@shared/workflow'
import { XpertStudioApiService } from '../../domain'
import { XpertStudioComponent } from '../../studio.component'
import { XpertStudioPanelComponent } from '../panel.component'
import { derivedAsync } from 'ngxtension/derived-async'
import { catchError, of } from 'rxjs'
import { MatInputModule } from '@angular/material/input'
import { TextFieldModule } from '@angular/cdk/text-field'

@Component({
  selector: 'xpert-studio-panel-workflow',
  templateUrl: './workflow.component.html',
  styleUrls: ['./workflow.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    TranslateModule,
    MatSlideToggleModule,
    MatInputModule,
    MatTooltipModule,
    TextFieldModule,
    NgmDensityDirective,
    NgmSpinComponent,
    XpertWorkflowCaseFormComponent
  ]
})
export class XpertStudioPanelWorkflowComponent {
  readonly elementRef = inject(ElementRef)
  readonly xpertStudioComponent = inject(XpertStudioComponent)
  readonly panelComponent = inject(XpertStudioPanelComponent)
  readonly studioService = inject(XpertStudioApiService)
  readonly xpertService = inject(XpertService)
  readonly #toastr = injectToastr()

  // Inputs
  readonly node = input<TXpertTeamNode>()

  // States
  readonly xpert = this.xpertStudioComponent.xpert
  readonly xpertId = computed(() => this.xpert()?.id)
  readonly workspaceId = computed(() => this.xpert()?.workspaceId)
  readonly key = computed(() => this.node()?.key)
  readonly wfNode = computed(() => this.node().entity as IWorkflowNode)
  readonly ifelseNode = computed(() => {
    const wfNode = this.wfNode()
    if (wfNode.type === WorkflowNodeTypeEnum.IF_ELSE) {
      return wfNode as IWFNIfElse
    }
    return null
  })

  readonly cases = computed(() => this.ifelseNode()?.cases)

  readonly variables = derivedAsync(() => {
    const xpertId = this.xpertId()
    return xpertId ? this.xpertService.getVariables(xpertId).pipe(
      catchError((error) => {
        this.#toastr.error(getErrorMessage(error))
        return of([])
      })
    ) : of(null)
  })

  readonly loading = signal(false)

  get title() {
    return this.wfNode().title
  }
  set title(value) {
    this.studioService.updateBlock(this.key(), {
      entity: {
        ...this.wfNode(),
        title: value
      }
    })
  }

  get description() {
    return this.wfNode().description
  }
  set description(value) {
    this.studioService.updateBlock(this.key(), {
      entity: {
        ...this.wfNode(),
        description: value
      }
    })
  }

  closePanel() {
    this.panelComponent.close()
  }

  addCase() {
    const entity: IWFNIfElse = {
      ...this.ifelseNode(),
      cases: [
        ...(this.ifelseNode().cases ?? []),
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
    const node = this.ifelseNode()
    node.cases[index] = value
    const entity: IWFNIfElse = {
      ...node,
      cases: [...node.cases]
    }
    this.studioService.updateBlock(this.key(), { entity })
  }

  remove(index: number) {
    const cases = [...(this.ifelseNode().cases ?? [])]
    cases.splice(index, 1)
    const entity: IWFNIfElse = {
      ...this.ifelseNode(),
      cases
    }
    this.studioService.updateBlock(this.key(), { entity })
  }
}
