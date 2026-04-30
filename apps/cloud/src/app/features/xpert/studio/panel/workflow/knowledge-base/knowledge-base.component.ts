import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core'
import { CdkMenuModule } from '@angular/cdk/menu'
import { FormsModule } from '@angular/forms'
import { RouterLink } from '@angular/router'
import { StateVariableSelectComponent } from '@cloud/app/@shared/agent'
import { attrModel, linkedModel } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  IWFNKnowledgeBase,
  IWorkflowNode,
  KnowledgeStructureEnum
} from 'apps/cloud/src/app/@core'
import { XpertStudioApiService } from '../../../domain'
import { XpertWorkflowBaseComponent } from '../workflow-base.component'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'

@Component({
  selector: 'xpert-workflow-knowledge-base',
  templateUrl: './knowledge-base.component.html',
  styleUrls: ['./knowledge-base.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    CdkMenuModule,
    ...ZardTooltipImports,
    RouterLink,
    TranslateModule,
    StateVariableSelectComponent
  ]
})
export class XpertWorkflowKnowledgeBaseComponent extends XpertWorkflowBaseComponent {
  eKnowledgeStructureEnum = KnowledgeStructureEnum

  readonly studioService = inject(XpertStudioApiService)

  // Inputs
  readonly entity = input<IWorkflowNode>()
  readonly knowledgebaseId = computed(() => this.xpert()?.knowledgebase?.id)

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

  readonly structure = attrModel(this.knowledgeBaseNode, 'structure', KnowledgeStructureEnum.General)
  readonly inputs = attrModel(this.knowledgeBaseNode, 'inputs')

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
