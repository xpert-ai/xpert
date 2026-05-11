import { CdkMenuModule } from '@angular/cdk/menu'
import { TextFieldModule } from '@angular/cdk/text-field'
import { Component, computed, effect, ElementRef, inject, input, model, output, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { attrModel, NgmI18nPipe } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  agentLabel,
  getVariableSchema,
  injectToastr,
  TStateVariable,
  TWFCaseCondition,
  TWorkflowVarGroup,
  WorkflowComparisonOperator,
  XpertParameterTypeEnum
} from '@cloud/app/@core'
import { expandVariablesWithItems, StateVariableSelectComponent, XpertVariableInputComponent } from '../../agent'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  selector: 'xpert-workflow-condition-form',
  templateUrl: './condition.component.html',
  styleUrls: ['./condition.component.scss'],
  imports: [
    FormsModule,
    CdkMenuModule,
    TranslateModule,
    ...ZardTooltipImports,
    TextFieldModule,
    NgmI18nPipe,
    XpertVariableInputComponent,
    StateVariableSelectComponent
  ]
})
export class XpertWorkflowConditionFormComponent {
  agentLabel = agentLabel
  eXpertParameterTypeEnum = XpertParameterTypeEnum

  readonly elementRef = inject(ElementRef)
  readonly #toastr = injectToastr()

  // Inputs
  readonly condition = model<TWFCaseCondition>()
  readonly variables = model<TWorkflowVarGroup[]>(null)
  readonly valueVariables = input<TWorkflowVarGroup[]>(null)

  // Outputs
  readonly deleted = output<void>()

  // States
  readonly loading = signal(false)

  readonly _variableSelector = attrModel(this.condition, 'variableSelector')

  readonly expandedVariables = computed(() => expandVariablesWithItems(this.variables()))
  readonly groupVariables = computed(() => {
    return this.variables()
  })
  readonly envVariables = computed(
    () => this.valueVariables() || this.variables()?.filter((g) => g.group?.name === 'env')
  )

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

  readonly variable = computed<TStateVariable | null>(
    () => getVariableSchema(this.expandedVariables(), this.condition()?.variableSelector).variable ?? null
  )

  readonly variableType = computed(() => this.variable()?.type)

  readonly operatorOptions = computed(() => {
    switch (this.variableType()) {
      case XpertParameterTypeEnum.NUMBER: {
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
      case XpertParameterTypeEnum.BOOLEAN: {
        return [
          {
            value: WorkflowComparisonOperator.IS_TRUE,
            label: {
              en_US: 'is true',
              zh_Hans: '为真'
            }
          },
          {
            value: WorkflowComparisonOperator.IS_FALSE,
            label: {
              en_US: 'is false',
              zh_Hans: '为假'
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
          },
          {
            value: WorkflowComparisonOperator.LIKE,
            label: {
              zh_Hans: '类似',
              en_US: 'like'
            }
          },
          {
            value: WorkflowComparisonOperator.NOT_LIKE,
            label: {
              zh_Hans: '不类似',
              en_US: 'not like'
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
      // console.log(this.variable(), this.variableSelector())
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
