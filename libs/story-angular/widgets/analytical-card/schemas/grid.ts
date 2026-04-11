import { AccordionWrappers, FORMLY_ROW } from '@xpert-ai/story/designer'
import { Positions, Shadows } from './common'

export function GridCapacity(className: string, I18N) {
  return AccordionWrappers([
    {
      key: 'grid',
      label: I18N?.GRID?.GRID ?? 'Grid',
      fieldGroup: [
        {
          fieldGroupClassName: FORMLY_ROW,
          fieldGroup: Grid(className, I18N)
        }
      ]
    }
  ])
}

export function Grid(className?, I18N?) {
  return [
    {
      className,
      key: 'show',
      type: 'checkbox',
      templateOptions: {
        label: I18N?.GRID?.SHOW ?? 'Show'
      }
    },
    {
      className,
      key: 'containLabel',
      type: 'checkbox',
      templateOptions: {
        label: I18N?.GRID?.CONTAIN_LABEL ?? 'Contain Axis Label'
      }
    },
    ...Positions(className, I18N),
    {
      className,
      key: 'backgroundColor',
      type: 'color',
      templateOptions: {
        label: I18N?.GRID?.BACKGROUND_COLOR ?? 'Background Color'
      }
    },
    {
      className,
      key: 'borderColor',
      type: 'color',
      templateOptions: {
        label: I18N?.GRID?.BORDER_COLOR ?? 'Border Color'
      }
    },
    {
      className,
      key: 'borderWidth',
      type: 'input',
      templateOptions: {
        label: I18N?.GRID?.BORDER_WIDTH ?? 'Background Width',
        type: 'number'
      }
    },

    ...Shadows(className, I18N)
  ]
}
