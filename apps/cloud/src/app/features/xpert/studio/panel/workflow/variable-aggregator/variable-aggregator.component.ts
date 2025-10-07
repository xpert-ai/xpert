import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { StateVariableSelectComponent } from '@cloud/app/@shared/agent'
import { attrModel, linkedModel } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  getVariableSchema,
  IWFNVariableAggregator,
  IWorkflowNode,
  KnowledgebaseService
} from 'apps/cloud/src/app/@core'
import { XpertStudioApiService } from '../../../domain'
import { XpertWorkflowBaseComponent } from '../workflow-base.component'

@Component({
  selector: 'xpert-workflow-variable-aggregator',
  templateUrl: './variable-aggregator.component.html',
  styleUrls: ['./variable-aggregator.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatTooltipModule, TranslateModule, StateVariableSelectComponent]
})
export class XpertWorkflowVariableAggregatorComponent extends XpertWorkflowBaseComponent {
  readonly studioService = inject(XpertStudioApiService)
  readonly knowledgebaseAPI = inject(KnowledgebaseService)

  // Inputs
  readonly entity = input<IWorkflowNode>()

  // States
  readonly variableAggregator = linkedModel({
    initialValue: null,
    compute: () => this.entity() as IWFNVariableAggregator,
    update: (value) => this.studioService.updateWorkflowNode(this.key(), () => value)
  })
  readonly inputs = attrModel(this.variableAggregator, 'inputs')
  readonly outputType = attrModel(this.variableAggregator, 'outputType')
  readonly firstVariable = computed(() => this.inputs()?.[0] ?? null)
  readonly firstVariableType = computed(() => getVariableSchema(this.variables(), this.firstVariable()).variable?.type)

  readonly expandOutputVariables = signal(false)

  constructor() {
    super()

    effect(
      () => {
        if (!this.outputType() && this.firstVariableType() || this.firstVariableType() && this.outputType() !== this.firstVariableType()) {
          this.outputType.set(this.firstVariableType())
        }
      },
      { allowSignalWrites: true }
    )
  }

  addInput() {
    this.inputs.update((inputs) => [...(inputs ?? []), ''])
  }

  onUpdateInput(index: number, value: string) {
    this.inputs.update((inputs) => {
      const newInputs = [...(inputs ?? [])]
      newInputs[index] = value
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

  toggleOutput() {
    this.expandOutputVariables.update((state) => !state)
  }
}
