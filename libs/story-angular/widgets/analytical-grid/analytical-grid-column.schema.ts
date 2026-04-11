import { Injectable } from '@angular/core'
import { AnalyticalGridColumnOptions } from '@xpert-ai/ocap-angular/analytical-grid'
import { BaseDesignerSchemaService, BaseSchemaState, FORMLY_ROW, FORMLY_W_1_2 } from '@xpert-ai/story/designer'
import { combineLatest } from 'rxjs'
import { map } from 'rxjs/operators'

const className = FORMLY_W_1_2

@Injectable()
export class AnalyticalGridColumnSchemaService extends BaseDesignerSchemaService<
  BaseSchemaState<{
    name: string
    caption: string
    options: AnalyticalGridColumnOptions
  }>
> {
  private readonly caption$ = this.select((state) => state.model?.caption)

  getSchema() {
    return combineLatest([this.caption$, this.translate.stream('Story.Widgets')]).pipe(
      map(([caption, i18n]) => [
        {
          key: 'name',
          type: 'empty'
        },
        {
          key: 'caption',
          type: 'empty'
        },
        {
          key: 'options',
          wrappers: ['panel'],
          props: {
            padding: true,
            label: caption
          },
          fieldGroup: [
            {
              key: 'formatting',
              fieldGroupClassName: FORMLY_ROW,
              fieldGroup: [
                {
                  className,
                  key: 'digitsInfo',
                  type: 'input',
                  props: {
                    label: i18n?.AnalyticalGrid?.DigitsInfo ?? 'Digits Info'
                  }
                },
                {
                  className,
                  key: 'unit',
                  type: 'input',
                  props: {
                    label: i18n?.AnalyticalGrid?.Unit ?? 'Unit'
                  }
                },
                {
                  className,
                  key: 'currencyCode',
                  type: 'input',
                  props: {
                    label: i18n?.AnalyticalGrid?.CurrencyCode ?? 'Currency Code'
                  }
                }
              ]
            }
          ]
        }
      ])
    )
  }
}
