import { Injectable, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { ReferenceLineAggregation, ReferenceLineType, ReferenceLineValueType } from '@xpert-ai/ocap-core'
import { DesignerSchema, FORMLY_ROW, FORMLY_W_1_2 } from '@xpert-ai/story/designer'
import { TranslateService } from '@ngx-translate/core'
import { BehaviorSubject, Observable, map } from 'rxjs'

@Injectable()
export class ReferenceLineSchemaService implements DesignerSchema<any> {
  protected translate = inject(TranslateService)
  get model() {
    return this.model$.value
  }
  set model(value) {
    this.model$.next(value)
  }
  private readonly model$ = new BehaviorSubject<any>(null)

  readonly storyDesigner$ = this.translate.stream('Story.Widgets')

  readonly title$ = this.storyDesigner$.pipe(
    map((i18n) => i18n?.CHART?.ReferenceLine?.Title ?? 'Create Reference Lines')
  )
  readonly title = toSignal(this.title$)

  getTitle(): Observable<string> {
    return this.title$
  }

  getSchema() {
    return this.storyDesigner$.pipe(
      map((i18n) => i18n?.CHART?.ReferenceLine),
      map((ReferenceLine) => {
        const className = FORMLY_W_1_2
        return [
          {
            key: 'referenceLines',
            type: 'array',
            props: {
              padding: true,
              labelField: 'label',
              removeLabel: ReferenceLine?.removeLabel ?? 'Remove'
            },
            fieldArray: {
              fieldGroupClassName: FORMLY_ROW,
              fieldGroup: [
                {
                  className,
                  key: 'label',
                  type: 'input',
                  templateOptions: {
                    label: ReferenceLine?.Label ?? 'Label',
                    required: true
                  }
                },
                {
                  className,
                  key: 'type',
                  type: 'select',
                  templateOptions: {
                    label: ReferenceLine?.Type ?? 'Visual Type',
                    required: true,
                    options: [
                      { value: ReferenceLineType.markLine, label: ReferenceLine?.MarkLine ?? 'Mark Line' },
                      { value: ReferenceLineType.markPoint, label: ReferenceLine?.MarkPoint ?? 'Mark Point' }
                    ]
                  }
                },
                {
                  className,
                  key: 'valueType',
                  type: 'select',
                  templateOptions: {
                    label: ReferenceLine?.ValueType ?? 'Value Type',
                    required: true,
                    options: [
                      { value: ReferenceLineValueType.fixed, label: ReferenceLine?.Fixed ?? 'Fixed' },
                      { value: ReferenceLineValueType.dynamic, label: ReferenceLine?.Dynamic ?? 'Dynamic' }
                    ]
                  }
                },
                {
                  className,
                  key: 'value',
                  type: 'input',
                  templateOptions: {
                    label: ReferenceLine?.Value ?? 'Value',
                    type: 'number'
                  }
                },
                {
                  className,
                  key: 'aggregation',
                  type: 'select',
                  templateOptions: {
                    label: ReferenceLine?.Aggregation ?? 'Aggregation',
                    options: [
                      { value: ReferenceLineAggregation.min, label: ReferenceLine?.Min ?? 'Min' },
                      { value: ReferenceLineAggregation.max, label: ReferenceLine?.Max ?? 'Max' },
                      { value: ReferenceLineAggregation.average, label: ReferenceLine?.Average ?? 'Average' },
                      { value: ReferenceLineAggregation.median, label: ReferenceLine?.Median ?? 'Median' }
                    ]
                  }
                }
                // {
                //   className,
                //   key: 'above',
                //   type: 'input',
                //   templateOptions: {
                //     label: '大于值区域的颜色',
                //   }
                // },
                // {
                //   className,
                //   key: 'below',
                //   type: 'input',
                //   templateOptions: {
                //     label: '小于值区域的颜色',
                //   }
                // }
              ]
            }
          }
        ]
      })
    )
  }
}
