import { AccordionWrappers, FORMLY_ROW } from '@xpert-ai/story/designer'
import {
  AxisLabelAccordionWrappers,
  AxisLineAccordionWrappers,
  AxisPointerAccordionWrappers,
  AxisTickAccordionWrappers,
  SplitLineAccordionWrappers
} from './axis'
import { Positions, WidthHeight } from './common'

export function Grid3DCapacity(className: string, I18N) {
  return AccordionWrappers([
    {
      key: 'grid3D',
      label: I18N?.DDD?.GridTitle ?? 'Grid 3D',
      fieldGroup: [
        {
          fieldGroupClassName: FORMLY_ROW,
          fieldGroup: [
            ...Positions(className, I18N),
            ...WidthHeight(className, I18N),
            {
              className,
              key: 'boxWidth',
              type: 'input',
              props: {
                label: I18N?.DDD?.BoxWidth ?? 'Box Width',
                type: 'number'
              }
            },
            {
              className,
              key: 'boxHeight',
              type: 'input',
              props: {
                label: I18N?.DDD?.BoxHeight ?? 'Box Height',
                type: 'number'
              }
            },
            {
              className,
              key: 'boxDepth',
              type: 'input',
              props: {
                label: I18N?.DDD?.BoxDepth ?? 'Box Depth',
                type: 'number'
              }
            },
            {
              className: 'ngm-formly__col ngm-formly__col-12',
              key: 'environment',
              type: 'json',
              props: {
                label: I18N?.DDD?.Environment ?? 'Environment',
                placeholder: 'json',
                autosize: true
              }
            },
            {
              className: 'ngm-formly__col ngm-formly__col-12',
              key: 'light',
              type: 'json',
              props: {
                label: I18N?.DDD?.Light ?? 'Light',
                placeholder: 'json',
                autosize: true,
                autosizeMinRows: 2
              }
            },
            {
              className: 'ngm-formly__col ngm-formly__col-12',
              key: 'postEffect',
              type: 'json',
              props: {
                label: I18N?.DDD?.PostEffect ?? 'Post Effect',
                placeholder: 'json',
                autosize: true,
                autosizeMinRows: 2
              }
            },
            {
              className: 'ngm-formly__col ngm-formly__col-12',
              key: 'viewControl',
              type: 'json',
              props: {
                label: I18N?.DDD?.ViewControl ?? 'View Control',
                placeholder: 'json',
                autosize: true,
                autosizeMinRows: 2
              }
            }
          ]
        },
        {
          key: 'temporalSuperSampling',
          wrappers: ['panel'],
          props: {
            label: I18N?.DDD?.TemporalSuperSampling ?? 'Temporal Super Sampling'
          },
          fieldGroup: [
            {
              className,
              key: 'enable',
              type: 'toggle',
              props: {
                label: I18N?.DDD?.Enable ?? 'Enable',
                type: 'number'
              }
            }
          ]
        },
        ...AxisLineAccordionWrappers(className, I18N),
        ...AxisLabelAccordionWrappers(className, I18N),
        ...AxisTickAccordionWrappers(className, I18N),
        ...SplitLineAccordionWrappers(className, I18N),
        ...AxisPointerAccordionWrappers(className, I18N)
      ]
    }
  ])
}
