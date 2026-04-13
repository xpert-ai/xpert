import { FORMLY_ROW } from '@xpert-ai/story/designer'
import { EmphasisAccordionWrappers, ItemStyleAccordionWrappers, Positions, WidthHeight } from '../common'
import { LabelAccordionWrappers, LabelLineAccordionWrappers } from './label'

export function FunnelCapacity(className: string, I18N) {
  return [
    {
      key: '__showSeriesAttributes__',
      type: 'empty'
    },
    {
      wrappers: ['accordion'],
      templateOptions: {
        elevationZ: true
      },
      fieldGroup: [
        {
          key: 'seriesStyle',
          hideExpression: `!field.parent.model.__showSeriesAttributes__`,
          templateOptions: {
            label: I18N?.SeriesStyle?.Title ?? 'Series Attributes',
            keyShow: '__showSeriesAttributes__'
          },
          fieldGroup: [
            {
              fieldGroupClassName: FORMLY_ROW,
              fieldGroup: [
                {
                  className,
                  key: 'funnelAlign',
                  type: 'select',
                  templateOptions: {
                    label: I18N?.SeriesStyle?.FunnelAlign ?? 'Funnel Align',
                    options: [
                      { value: null, label: 'None' },
                      { value: 'left', label: 'Left' },
                      { value: 'center', label: 'Center' },
                      { value: 'right', label: 'Right' }
                    ]
                  }
                },

                ...Positions(className, I18N),
                ...WidthHeight(className, I18N)
              ]
            },
            ...ItemStyleAccordionWrappers(className, I18N),
            ...LabelAccordionWrappers(className, I18N),
            ...LabelLineAccordionWrappers(className, I18N),
            ...EmphasisAccordionWrappers(className, I18N),
          ]
        }
      ]
    }
  ]
}
