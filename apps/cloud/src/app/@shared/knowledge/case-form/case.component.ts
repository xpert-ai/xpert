import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  model,
  output,
  signal
} from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { TranslateModule } from '@ngx-translate/core'
import {
  KBMetadataFieldDef,
  TWFCase,
  TWFCaseCondition,
  uuid,
  WorkflowComparisonOperator,
  WorkflowLogicalOperator,
  XpertAPIService
} from 'apps/cloud/src/app/@core'
import { NgmSelectPanelComponent } from '../../common'
import { XpertKnowledgeConditionFormComponent } from '../condition-form/condition.component'

@Component({
  selector: 'xp-knowledge-case-form',
  templateUrl: './case.component.html',
  styleUrls: ['./case.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    CdkMenuModule,
    TranslateModule,
    MatTooltipModule,
    NgmSelectPanelComponent,
    XpertKnowledgeConditionFormComponent
  ],
})
export class XpertKnowledgeCaseFormComponent {
  eWorkflowLogicalOperator = WorkflowLogicalOperator

  readonly elementRef = inject(ElementRef)
  readonly xpertService = inject(XpertAPIService)

  // Inputs
  readonly case = model<TWFCase>()
  readonly index = model<number>()
  readonly first = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })
  readonly fields = input<KBMetadataFieldDef[]>()

  // Outputs
  readonly deleted = output<void>()

  // States
  readonly conditions = computed(() => this.case()?.conditions)
  readonly logicalOperator = computed(() => this.case()?.logicalOperator)
  readonly metadataFieldsOptions = computed(() =>
    this.fields().map((field) => ({
      value: field.key,
      label: field.label || field.key,
      description: field.description
    }))
  )

  readonly loading = signal(false)

  addCondition(value: string) {
    this.case.update((state) => {
      return {
        ...state,
        conditions: [...state.conditions, {
          id: uuid(),
          variableSelector: value,
          comparisonOperator: null
        }]
      }
    })
  }

  updateCondition(index: number, value: TWFCaseCondition) {
    this.case.update((state) => {
      state.conditions[index] = value
      return { ...state, conditions: [...state.conditions] }
    })
  }

  remove(index: number) {
    this.case.update((state) => {
      state.conditions.splice(index, 1)
      return state
    })
  }

  switchOperator() {
    this.case.update((state) => {
      state.logicalOperator =
        state.logicalOperator === WorkflowLogicalOperator.AND ? WorkflowLogicalOperator.OR : WorkflowLogicalOperator.AND
      return { ...state }
    })
  }
}
