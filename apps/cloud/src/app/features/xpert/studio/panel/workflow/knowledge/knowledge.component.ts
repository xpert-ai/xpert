import { Dialog } from '@angular/cdk/dialog'
import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { StateVariableSelectComponent } from '@cloud/app/@shared/agent'
import { KnowledgeSelectReferenceComponent } from '@cloud/app/@shared/knowledge'
import { linkedModel } from '@metad/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  injectToastr,
  IWFNKnowledgeRetrieval,
  IWorkflowNode,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum,
  XpertService
} from 'apps/cloud/src/app/@core'
import { XpertStudioApiService } from '../../../domain'
import { XpertStudioComponent } from '../../../studio.component'
import { XpertWorkflowBaseComponent } from '../workflow-base.component'
import { toSignal } from '@angular/core/rxjs-interop'

@Component({
  selector: 'xpert-workflow-knowledge',
  templateUrl: './knowledge.component.html',
  styleUrls: ['./knowledge.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatTooltipModule, TranslateModule, StateVariableSelectComponent],
  host: {
    tabindex: '-1'
  }
})
export class XpertWorkflowKnowledgeComponent extends XpertWorkflowBaseComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum

  readonly elementRef = inject(ElementRef)
  readonly xpertStudioComponent = inject(XpertStudioComponent)
  readonly studioService = inject(XpertStudioApiService)
  readonly xpertService = inject(XpertService)
  readonly #dialog = inject(Dialog)
  readonly #toastr = injectToastr()

  // Inputs
  readonly entity = input<IWorkflowNode>()

  // States
  readonly workspaceId = computed(() => this.xpert()?.workspaceId)
  readonly knowledgeRetrieval = computed(() => this.entity() as IWFNKnowledgeRetrieval)
  readonly queryVariable = linkedModel({
    initialValue: null,
    compute: () => this.knowledgeRetrieval()?.queryVariable,
    update: (value) => {
      this.studioService.updateWorkflowNode(this.key(), (entity) => {
        ;(<IWFNKnowledgeRetrieval>entity).queryVariable = value
        return entity as IWorkflowNode
      })
    }
  })

  readonly knowledgebases = toSignal(this.studioService.knowledgebases$)

  onFocus(event: Event) {}

  select() {
    this.#dialog.open(KnowledgeSelectReferenceComponent, {
      data: {
        knowledgebases: this.knowledgebases()
      }
    }).closed.subscribe((value) => {
      console.log(value)
    })
  }
}
