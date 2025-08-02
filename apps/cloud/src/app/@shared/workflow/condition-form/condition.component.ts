import { CdkMenuModule } from '@angular/cdk/menu'
import { TextFieldModule } from '@angular/cdk/text-field'
import { Component, computed, effect, ElementRef, inject, input, model, output, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { attrModel, NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  agentLabel,
  injectToastr,
  TStateVariable,
  TWFCaseCondition,
  TWorkflowVarGroup,
  WorkflowComparisonOperator,
} from 'apps/cloud/src/app/@core'
import { StateVariableSelectComponent, TXpertVariablesOptions, XpertVariableInputComponent } from '../../agent'

@Component({
  standalone: true,
  selector: 'xpert-workflow-condition-form',
  templateUrl: './condition.component.html',
  styleUrls: ['./condition.component.scss'],
  imports: [
    FormsModule,
    CdkMenuModule,
    TranslateModule,
    MatTooltipModule,
    TextFieldModule,
    NgmI18nPipe,
    XpertVariableInputComponent,
    StateVariableSelectComponent
  ]
})
export class XpertWorkflowConditionFormComponent {
  agentLabel = agentLabel

  readonly elementRef = inject(ElementRef)
  readonly #toastr = injectToastr()

  // Inputs
  readonly condition = model<TWFCaseCondition>()
  readonly varOptions = input.required<TXpertVariablesOptions>()

  // Outputs
  readonly deleted = output<void>()

  // States
  readonly loading = signal(false)
  readonly variables = model<TWorkflowVarGroup[]>(null)
  readonly _variableSelector = attrModel(this.condition, 'variableSelector')

  readonly variableSelector = computed(() => {
    const names = this.condition()?.variableSelector?.split('.')
    if (names?.length > 1) {
      return {
        group: names[0],
        name: names[1]
      }
    }
    return {
      group: '',
      name: this.condition()?.variableSelector
    }
  })
  readonly groupVariables = computed(() => {
    return this.variables()
  })
  readonly envVariables = computed(() => this.variables()?.filter((g) => g.group?.name === 'env'))

  readonly hoverDelete = signal(false)

  get value() {
    return this.condition()?.value
  }
  set value(value) {
    this.condition.update((state) => ({ ...(state ?? {}), value }) as TWFCaseCondition)
  }

  get comparisonOperator() {
    return this.condition()?.comparisonOperator
  }
  set comparisonOperator(value) {
    this.condition.update((state) => ({ ...(state ?? {}), comparisonOperator: value }) as TWFCaseCondition)
  }

  readonly variable = computed<TStateVariable>(() => {
    const { group, name } = this.variableSelector() ?? {}
    let variable = null
    this.variables()?.some((g) => {
      if ((group && g.agent?.key === group) || (!group && !g.agent?.key)) {
        variable = g.variables.find((_) => _.name === name)
      }
      return !!variable
    })
    return variable
  })

  readonly operatorOptions = computed(() => {
    switch (this.variable()?.type) {
      case 'number': {
        return [
          {
            value: WorkflowComparisonOperator.EQUAL,
            label: {
              en_US: '='
            }
          },
          {
            value: WorkflowComparisonOperator.NOT_EQUAL,
            label: {
              en_US: '≠'
            }
          },
          {
            value: WorkflowComparisonOperator.GT,
            label: {
              en_US: '>'
            }
          },
          {
            value: WorkflowComparisonOperator.LT,
            label: {
              en_US: '<'
            }
          },
          {
            value: WorkflowComparisonOperator.GE,
            label: {
              en_US: '≥'
            }
          },
          {
            value: WorkflowComparisonOperator.LE,
            label: {
              en_US: '≤'
            }
          },
          {
            value: WorkflowComparisonOperator.EMPTY,
            label: {
              en_US: 'is empty',
              zh_Hans: '空'
            }
          },
          {
            value: WorkflowComparisonOperator.NOT_EMPTY,
            label: {
              en_US: 'not empty',
              zh_Hans: '非空'
            }
          }
        ]
      }
      default: {
        return [
          {
            value: WorkflowComparisonOperator.CONTAINS,
            label: {
              zh_Hans: '包含',
              en_US: 'contains'
            }
          },
          {
            value: WorkflowComparisonOperator.NOT_CONTAINS,
            label: {
              zh_Hans: '不包含',
              en_US: 'not contains'
            }
          },
          {
            value: WorkflowComparisonOperator.STARTS_WITH,
            label: {
              zh_Hans: '开始是',
              en_US: 'starts with'
            }
          },
          {
            value: WorkflowComparisonOperator.ENDS_WITH,
            label: {
              zh_Hans: '结束是',
              en_US: 'ends with'
            }
          },
          {
            value: WorkflowComparisonOperator.EQUAL,
            label: {
              zh_Hans: '是',
              en_US: 'is'
            }
          },
          {
            value: WorkflowComparisonOperator.NOT_EQUAL,
            label: {
              zh_Hans: '不是',
              en_US: 'not is'
            }
          },
          {
            value: WorkflowComparisonOperator.EMPTY,
            label: {
              zh_Hans: '为空',
              en_US: 'is empty'
            }
          },
          {
            value: WorkflowComparisonOperator.NOT_EMPTY,
            label: {
              zh_Hans: '不为空',
              en_US: 'is not empty'
            }
          }
        ]
      }
    }
  })

  readonly operatorLabel = computed(
    () =>
      this.operatorOptions()?.find((_) => _.value === this.condition()?.comparisonOperator)?.label ||
      this.condition()?.comparisonOperator
  )

  constructor() {
    effect(() => {
      // console.log(this.variable())
    })
  }

  selectVariable(group: string, variable: TStateVariable) {
    this.condition.update(
      (state) =>
        ({
          ...(state ?? {}),
          variableSelector: group ? `${group}.${variable.name}` : variable.name
        }) as TWFCaseCondition
    )
  }

  selectOperator(value: WorkflowComparisonOperator) {
    this.comparisonOperator = value
  }
}
