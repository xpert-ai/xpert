import { AccordionWrappers, FORMLY_ROW } from '@xpert-ai/story/designer'
import {
  BackgroundStyleAccordionWrappers,
  EmphasisAccordionWrappers,
  ItemStyleAccordionWrappers,
  MarkLineAccordionWrappers,
  SelectAccordionWrappers,
  SeriesCommon,
  Stacks
} from '../common'
import { LabelAccordionWrappers, LabelLineAccordionWrappers } from './label'

export function BarCapacity(className: string, I18N) {
  return AccordionWrappers([
    {
      key: 'seriesStyle',
      label: I18N?.SeriesStyle?.Title ?? 'Series Attributes',
      fieldGroup: [
        {
          fieldGroupClassName: FORMLY_ROW,
          fieldGroup: [
            {
              className,
              key: 'barWidth',
              type: 'slider',
              props: {
                label: I18N?.Bar?.BarWidth ?? 'Bar Width',
                type: 'number',
                placeholder: 'barWidth',
                thumbLabel: true,
                autoScale: true
              }
            },
            {
              className,
              key: 'barMaxWidth',
              type: 'slider',
              props: {
                label: I18N?.Bar?.BarMaxWidth ?? 'Bar Max Width',
                type: 'number',
                placeholder: 'barMaxWidth',
                thumbLabel: true,
                autoScale: true
              }
            },
            {
              className,
              key: 'barMinWidth',
              type: 'slider',
              props: {
                label: I18N?.Bar?.BarMinWidth ?? 'Bar Min Width',
                type: 'number',
                placeholder: 'barMinWidth',
                thumbLabel: true,
                autoScale: true
              }
            },
            {
              className,
              key: 'barMinHeight',
              type: 'slider',
              props: {
                label: I18N?.Bar?.BarMinHeight ?? 'Bar Min Height',
                type: 'number',
                placeholder: 'barMinHeight',
                thumbLabel: true,
                autoScale: true
              }
            },
            {
              className,
              key: 'barMinAngle',
              type: 'slider',
              props: {
                label: I18N?.Bar?.BarMinAngle ?? 'Bar Min Angle',
                type: 'number',
                placeholder: 'barMinAngle',
                thumbLabel: true,
                min: 0,
                max: 90
              }
            },
            {
              className,
              key: 'barGap',
              type: 'input',
              props: {
                label: I18N?.Bar?.BarGap ?? 'Bar Gap',
                placeholder: 'barGap',
                thumbLabel: true,
                autoScale: true
              }
            },
            {
              className,
              key: 'barCategoryGap',
              type: 'input',
              props: {
                label: I18N?.Bar?.BarCategoryGap ?? 'Bar Category Gap',
                placeholder: 'barCategoryGap',
                thumbLabel: true,
                autoScale: true
              }
            },
            ...Stacks(className, I18N),
            ...SeriesCommon(className, I18N).fieldGroup,
            {
              className,
              key: 'roundCap',
              type: 'checkbox',
              props: {
                label: I18N?.Bar?.RoundCap ?? 'Round Cap'
              }
            }
          ]
        },

        ...ItemStyleAccordionWrappers(className, I18N),
        ...LabelAccordionWrappers(className, I18N),
        ...LabelLineAccordionWrappers(className, I18N),
        ...EmphasisAccordionWrappers(className, I18N),
        ...BackgroundStyleAccordionWrappers(className, I18N),
        ...SelectAccordionWrappers(className, I18N),
        ...MarkLineAccordionWrappers(className, I18N)
      ]
    }
  ])
}
