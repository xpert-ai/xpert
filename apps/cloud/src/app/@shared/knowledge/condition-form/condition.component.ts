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
  KBMetadataFieldDef,
  TWFCaseCondition,
  WorkflowComparisonOperator,
  XpertParameterTypeEnum,
} from 'apps/cloud/src/app/@core'
import { XpertVariableInputComponent } from '../../agent'

@Component({
  standalone: true,
  selector: 'xp-knowledge-condition-form',
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
  ]
})
export class XpertKnowledgeConditionFormComponent {
  agentLabel = agentLabel
  eXpertParameterTypeEnum = XpertParameterTypeEnum

  readonly elementRef = inject(ElementRef)
  readonly #toastr = injectToastr()

  // Inputs
  readonly condition = model<TWFCaseCondition>()
  readonly fields = input<KBMetadataFieldDef[]>()

  // Outputs
  readonly deleted = output<void>()

  // States
  readonly loading = signal(false)
  
  readonly variableSelector = attrModel(this.condition, 'variableSelector')

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

  readonly variable = computed(() => this.fields()?.find((field) => field.key === this.condition()?.variableSelector))

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

  selectOperator(value: WorkflowComparisonOperator) {
    this.comparisonOperator = value
  }
}
