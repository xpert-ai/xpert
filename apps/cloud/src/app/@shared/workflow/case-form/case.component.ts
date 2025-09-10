import { booleanAttribute, ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, model, output, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { TranslateModule } from '@ngx-translate/core'
import { injectToastr, TWFCase, TWFCaseCondition, TWorkflowVarGroup, uuid, WorkflowComparisonOperator, WorkflowLogicalOperator, XpertService } from 'apps/cloud/src/app/@core'
import { XpertWorkflowConditionFormComponent } from '../condition-form/condition.component'

@Component({
  selector: 'xpert-workflow-case-form',
  templateUrl: './case.component.html',
  styleUrls: ['./case.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslateModule, MatTooltipModule, XpertWorkflowConditionFormComponent],
  host: {
    '[class.danger]': 'hoverDelete()'
  }
})
export class XpertWorkflowCaseFormComponent {
  eWorkflowLogicalOperator = WorkflowLogicalOperator

  readonly elementRef = inject(ElementRef)
  readonly xpertService = inject(XpertService)
  readonly #toastr = injectToastr()

  // Inputs
  readonly case = model<TWFCase>()
  readonly index = model<number>()
  readonly first = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })
  readonly variables = input<TWorkflowVarGroup[]>()

  // Outputs
  readonly deleted = output<void>()

  // States
  readonly conditions = computed(() => this.case()?.conditions)
  readonly logicalOperator = computed(() => this.case()?.logicalOperator)

  readonly loading = signal(false)

  readonly hoverDelete = signal(false)

  addCondition() {
    this.case.update((state) => {
      state.conditions.push({
        id: uuid(),
        comparisonOperator: WorkflowComparisonOperator.CONTAINS
      })
      return state
    })
  }

  updateCondition(index: number, value: TWFCaseCondition) {
    this.case.update((state) => {
      state.conditions[index] = value
      return {...state, conditions: [...state.conditions]}
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
      state.logicalOperator = state.logicalOperator === WorkflowLogicalOperator.AND ? WorkflowLogicalOperator.OR : WorkflowLogicalOperator.AND
      return {...state}
    })
  }
}
