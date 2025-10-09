import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { StateVariableSelectComponent, XpertVariableInputComponent } from '@cloud/app/@shared/agent'
import { XpertWorkflowConditionFormComponent } from '@cloud/app/@shared/workflow'
import { NgmCheckboxComponent, NgmSlideToggleComponent } from '@metad/ocap-angular/common'
import { attrModel, linkedModel } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  getVariableSchema,
  IWFNListOperator,
  IWorkflowNode,
  KnowledgebaseService,
  TWFCaseCondition,
  uuid,
  WorkflowComparisonOperator
} from 'apps/cloud/src/app/@core'
import { XpertStudioApiService } from '../../../domain'
import { XpertWorkflowBaseComponent } from '../workflow-base.component'

@Component({
  selector: 'xpert-workflow-list-operator',
  templateUrl: './list-operator.component.html',
  styleUrls: ['./list-operator.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatTooltipModule,
    TranslateModule,
    NgmSlideToggleComponent,
    NgmCheckboxComponent,
    StateVariableSelectComponent,
    XpertWorkflowConditionFormComponent,
    XpertVariableInputComponent
  ]
})
export class XpertWorkflowListOperatorComponent extends XpertWorkflowBaseComponent {
  readonly studioService = inject(XpertStudioApiService)
  readonly knowledgebaseAPI = inject(KnowledgebaseService)

  // Inputs
  readonly entity = input<IWorkflowNode>()

  // States
  readonly workspaceId = computed(() => this.xpert()?.workspaceId)
  readonly listOperator = linkedModel({
    initialValue: null,
    compute: () => this.entity() as IWFNListOperator,
    update: (value) => this.studioService.updateWorkflowNode(this.key(), () => value)
  })

  readonly input = attrModel(this.listOperator, 'input')
  readonly itemVarType = attrModel(this.listOperator, 'itemVarType')

  readonly filterBy = attrModel(this.listOperator, 'filterBy')
  readonly filterByEnabled = attrModel(this.filterBy, 'enabled')
  readonly conditions = attrModel(this.filterBy, 'conditions')

  readonly inputVariableItems = computed(() => getVariableSchema(this.variables(), this.input()).variable?.item ?? [])
  readonly inputVariableType = computed(() => getVariableSchema(this.variables(), this.input()).variable?.type)
  readonly inputVariableItemType = computed(() => this.inputVariableType()?.replace('array[', '').replace(']', ''))
  readonly envVariables = computed(() => this.variables()?.filter((g) => g.group?.name === 'env'))

  readonly extractBy = attrModel(this.listOperator, 'extractBy')
  readonly extractByEnabled = attrModel(this.extractBy, 'enabled')
  readonly extractByIndex = attrModel(this.extractBy, 'index')

  readonly topN = attrModel(this.listOperator, 'topN')
  readonly topNEnabled = attrModel(this.topN, 'enabled')
  readonly topNCount = attrModel(this.topN, 'count')

  readonly sortBy = attrModel(this.listOperator, 'sortBy')
  readonly sortByEnabled = attrModel(this.sortBy, 'enabled')
  readonly sortByVariable = attrModel(this.sortBy, 'variable')
  readonly sortByDescending = attrModel(this.sortBy, 'descending')

  readonly expandOutputVariables = signal(false)

  constructor() {
    super()

    effect(() => {
      if (this.inputVariableItemType()) {
        this.itemVarType.set(this.inputVariableItemType())
      }
    }, { allowSignalWrites: true })
  }

  addCondition() {
    this.conditions.update((conditions) => [
      ...(conditions ?? []),
      {
        id: uuid(),
        comparisonOperator: WorkflowComparisonOperator.EQUAL,
        value: null,
        variableSelector: ''
      }
    ])
  }

  updateCondition(index: number, value: TWFCaseCondition) {
    this.conditions.update((conditions) => {
      conditions[index] = value
      return [...conditions]
    })
  }

  removeCondition(index: number) {
    this.conditions.update((conditions) => {
      conditions.splice(index, 1)
      return [...conditions]
    })
  }

  toggleOutput() {
    this.expandOutputVariables.update((state) => !state)
  }
}
