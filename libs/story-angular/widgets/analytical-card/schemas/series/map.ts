import { AccordionWrappers, FORMLY_ROW } from '@xpert-ai/story/designer'
import { Positions, SeriesCommon } from '../common'

export function MapCapacity(className: string, I18N) {
  return AccordionWrappers([
    {
      key: 'seriesStyle',
      label: I18N?.SeriesStyle?.Title ?? 'Series Attributes',
      fieldGroup: [
        SeriesCommon(className, I18N),
        {
          fieldGroupClassName: FORMLY_ROW,
          fieldGroup: [
            {
              className,
              key: 'center',
              type: 'json',
              props: {
                label: I18N?.Geo?.Center ?? 'Center',
                placeholder: '["50%", "50%"]',
                autosize: true
              }
            },
            {
              className,
              key: 'boundingCoords',
              type: 'json',
              props: {
                label: I18N?.Geo?.BoundingCoords ?? 'Bounding Coords',
                placeholder: '[[-180, 90],[180, -90]]',
                autosize: true
              }
            },
            {
              className,
              key: 'aspectScale',
              type: 'number',
              props: {
                label: I18N?.Geo?.AspectScale ?? 'Aspect Scale',
              }
            },
            {
              className,
              key: 'zoom',
              type: 'number',
              props: {
                label: I18N?.Geo?.Zoom ?? 'Zoom',
              }
            },
            {
              className,
              key: 'nameProperty',
              type: 'input',
              props: {
                label: I18N?.Geo?.NameProperty ?? 'Name Property',
              }
            },
            {
              className,
              key: 'showLegendSymbol',
              type: 'checkbox',
              props: {
                label: I18N?.Geo?.ShowLegendSymbol ?? 'Show Legend Symbol',
              }
            },
            {
              className,
              key: 'mapValueCalculation',
              type: 'select',
              props: {
                label: I18N?.Geo?.Aggregator ??  'Map Value Aggregator',
                options: [
                  { value: null, label: 'None' },
                  { value: 'sum', label: 'Sum' },
                  { value: 'average', label: 'Average' },
                  { value: 'max', label: 'Max' },
                  { value: 'min', label: 'Min' }
                ]
              }
            },
            ...Positions(className, I18N)
          ]
        }
      ]
    }
  ])
}
