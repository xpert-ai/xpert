import { AccordionWrappers, FORMLY_ROW } from '@xpert-ai/story/designer'
import { ItemStyleAccordionWrappers, SelectedMode } from '../common'
import { LabelAccordionWrappers } from './label'

export function HeatmapCapacity(className: string, I18N, coordinateSystem: 'cartesian2d' | 'calendar' | 'geo') {
  const fieldGroup = []

  fieldGroup.push(...[SelectedMode(className, I18N)])

  if (coordinateSystem === 'calendar') {
    fieldGroup.push({
      className,
      key: 'dateFormatter',
      type: 'input',
      props: {
        label: I18N?.Heatmap?.DateFormatter ?? 'Date Formatter'
      }
    })
  }

  if (coordinateSystem === 'geo') {
    fieldGroup.push(
      ...[
        {
          className,
          key: 'blurSize',
          type: 'input',
          props: {
            label: I18N?.Heatmap?.BlurSize ?? 'Blur Size',
            type: 'number'
          }
        }
      ]
    )
  }

  return AccordionWrappers([
    {
      key: 'seriesStyle',
      label: I18N?.SeriesStyle?.Title ?? 'Series Attributes',
      fieldGroup: [
        {
          fieldGroupClassName: FORMLY_ROW,
          fieldGroup
        },
        ...LabelAccordionWrappers(className, I18N),
        ...ItemStyleAccordionWrappers(className, I18N),
      ]
    }
  ])
}
