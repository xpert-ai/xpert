import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { StateVariableSelectComponent } from '@cloud/app/@shared/agent'
import { KnowledgeRecallParamsComponent, KnowledgeSelectReferenceComponent } from '@cloud/app/@shared/knowledge'
import { attrModel, linkedModel } from '@metad/core'
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

@Component({
  selector: 'xpert-workflow-knowledge',
  templateUrl: './knowledge.component.html',
  styleUrls: ['./knowledge.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatTooltipModule, TranslateModule, CdkMenuModule, StateVariableSelectComponent, KnowledgeRecallParamsComponent],
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
  readonly knowledgeRetrieval = linkedModel({
    initialValue: null,
    compute: () => this.entity() as IWFNKnowledgeRetrieval,
    update: (value) => {
      this.studioService.updateWorkflowNode(this.key(), (entity) => {
        return value
      })
    }
  })

  readonly queryVariable = attrModel(this.knowledgeRetrieval, 'queryVariable')
  readonly knowledgebases = attrModel(this.knowledgeRetrieval, 'knowledgebases')
  readonly recall = attrModel(this.knowledgeRetrieval, 'recall')

  readonly knowledgebaseList = toSignal(this.studioService.knowledgebases$)
  readonly selectedKnowledgebases = computed(() => {
    return this.knowledgebases()?.map((id) => ({
      id,
      kb: this.knowledgebaseList()?.find((_) => _.id === id)
    }))
  })

  onFocus(event: Event) {}

  select() {
    this.#dialog
      .open<string[]>(KnowledgeSelectReferenceComponent, {
        data: {
          knowledgebases: this.knowledgebaseList(),
          selected: this.knowledgebases()
        }
      })
      .closed.subscribe((value) => {
        if (value) {
          this.knowledgebases.set(value)
        }
      })
  }

  remove(index: number) {
    this.knowledgebases.update((ids) => {
      ids.splice(index, 1)
      return [...ids]
    })
  }

  edit(id: string) {}
}
