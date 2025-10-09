import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core'
import { CdkMenuModule } from '@angular/cdk/menu'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { StateVariableSelectComponent } from '@cloud/app/@shared/agent'
import { CopilotModelSelectComponent } from '@cloud/app/@shared/copilot'
import { attrModel, linkedModel } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  AiModelTypeEnum,
  IWFNKnowledgeBase,
  IWorkflowNode,
  KnowledgebaseService,
  KnowledgeStructureEnum,
} from 'apps/cloud/src/app/@core'
import { XpertStudioApiService } from '../../../domain'
import { XpertWorkflowBaseComponent } from '../workflow-base.component'

@Component({
  selector: 'xpert-workflow-knowledge-base',
  templateUrl: './knowledge-base.component.html',
  styleUrls: ['./knowledge-base.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    CdkMenuModule,
    MatTooltipModule,
    TranslateModule,
    StateVariableSelectComponent,
    CopilotModelSelectComponent
  ]
})
export class XpertWorkflowKnowledgeBaseComponent extends XpertWorkflowBaseComponent {
  eKnowledgeStructureEnum = KnowledgeStructureEnum
  eModelType = AiModelTypeEnum

  readonly studioService = inject(XpertStudioApiService)
  readonly knowledgebaseAPI = inject(KnowledgebaseService)

  // Inputs
  readonly entity = input<IWorkflowNode>()

  // States
  readonly workspaceId = computed(() => this.xpert()?.workspaceId)
  readonly knowledgeBaseNode = linkedModel({
    initialValue: null,
    compute: () => this.entity() as IWFNKnowledgeBase,
    update: (value) => {
      this.studioService.updateWorkflowNode(this.key(), (entity) => {
        return value
      })
    }
  })

  readonly structure = attrModel(this.knowledgeBaseNode, 'structure')
  readonly inputs = attrModel(this.knowledgeBaseNode, 'inputs')
  readonly copilotModel = attrModel(this.knowledgeBaseNode, 'copilotModel')
  readonly rerankModel = attrModel(this.knowledgeBaseNode, 'rerankModel')

  updateInput(index: number, value: string) {
    this.inputs.update((inputs) => {
      const newInputs = [...(inputs ?? [])]
      newInputs[index] = value
      return newInputs
    })
  }

  addInput() {
    this.inputs.update((inputs) => {
      const newInputs = [...(inputs ?? []), '']
      return newInputs
    })
  }

  removeInput(index: number) {
    this.inputs.update((inputs) => {
      const newInputs = [...(inputs ?? [])]
      newInputs.splice(index, 1)
      return newInputs
    })
  }
}
