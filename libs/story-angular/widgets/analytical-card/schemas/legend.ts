import { AccordionWrappers, FORMLY_ROW } from '@xpert-ai/story/designer'
import { LineStyle } from './axis'
import { ItemStyleAccordionWrappers, Orient, PaddingJSON, SymbolOptions, TextStyles, WidthHeight } from './common'

export function LegendCapacity(className: string, I18N) {
  return AccordionWrappers([
    {
      key: 'legend',
      label: I18N?.LEGEND?.TITLE ?? 'Legend',
      fieldGroup: [
        ...Legend(className, I18N),
        ...ItemStyleAccordionWrappers(className, I18N),
        ...AccordionWrappers([
          {
            key: 'lineStyle',
            label: I18N?.LineStyle?.Title ?? 'Line Style',
            fieldGroup: LineStyle(className, I18N)
          },
          {
            key: 'textStyle',
            label: I18N?.LEGEND?.TextStyle ?? 'Text Style',
            fieldGroup: [
              {
                fieldGroupClassName: FORMLY_ROW,
                fieldGroup: TextStyles(className, I18N)
              }
            ]
          }
        ])
      ]
    }
  ])
}

export function Legend(className: string, I18N) {
  return [
    {
      fieldGroupClassName: FORMLY_ROW,
      fieldGroup: [
        {
          className,
          key: 'show',
          type: 'checkbox',
          templateOptions: {
            label: I18N?.Common?.Show ?? 'Show'
          }
        },
        {
          className,
          key: 'type',
          type: 'select',
          templateOptions: {
            label: I18N?.LEGEND?.LEGEND_TYPE ?? 'Type',
            options: [
              { value: 'plain', label: 'Plain' },
              { value: 'scroll', label: 'Scroll' }
            ]
          }
        },
        Orient(className, I18N),
        {
          className,
          key: 'align',
          type: 'select',
          templateOptions: {
            label: I18N?.LEGEND?.Align ?? 'Align',
            options: [
              { value: 'auto', label: I18N?.LEGEND?.Align_Auto ?? 'Auto' },
              { value: 'left', label: I18N?.LEGEND?.Align_Left ?? 'Left' },
              { value: 'right', label: I18N?.LEGEND?.Align_Right ?? 'Right' }
            ]
          }
        },
        {
          className,
          key: 'left',
          type: 'input',
          templateOptions: {
            type: 'number',
            label: I18N?.LEGEND?.LEGEND_LEFT ?? 'Left'
          }
        },
        {
          className,
          key: 'top',
          type: 'input',
          templateOptions: {
            type: 'number',
            label: I18N?.LEGEND?.LEGEND_TOP ?? 'Top'
          }
        },
        {
          className,
          key: 'right',
          type: 'input',
          templateOptions: {
            type: 'number',
            label: I18N?.LEGEND?.LEGEND_RIGHT ?? 'Right'
          }
        },
        {
          className,
          key: 'bottom',
          type: 'input',
          templateOptions: {
            type: 'number',
            label: I18N?.LEGEND?.LEGEND_BOTTOM ?? 'Bottom'
          }
        },

        ...WidthHeight(className, I18N),

        PaddingJSON(className, I18N),

        {
          className,
          key: 'itemGap',
          type: 'input',
          templateOptions: {
            type: 'number',
            label: I18N?.LEGEND?.ItemGap ?? 'Item Gap'
          }
        },

        {
          className,
          key: 'itemWidth',
          type: 'input',
          templateOptions: {
            type: 'number',
            label: I18N?.LEGEND?.ItemWidth ?? 'Item Width'
          }
        },

        {
          className,
          key: 'itemHeight',
          type: 'input',
          templateOptions: {
            type: 'number',
            label: I18N?.LEGEND?.ItemHeight ?? 'Item Height'
          }
        },

        SelectedMode(className, I18N),
        {
          className,
          key: 'inactiveColor',
          type: 'color',
          props: {
            label: I18N?.LEGEND?.InactiveColor ?? 'Inactive Color'
          }
        },
        {
          className,
          key: 'inactiveBorderColor',
          type: 'color',
          props: {
            label: I18N?.LEGEND?.InactiveBorderColor ?? 'Inactive Border Color'
          }
        },
        {
          className,
          key: 'inactiveBorderWidth',
          type: 'input',
          props: {
            label: I18N?.LEGEND?.InactiveBorderWidth ?? 'Inactive Border Width'
          }
        },
        {
          className,
          key: 'icon',
          type: 'select',
          props: {
            label: I18N?.LEGEND?.IconSymbol ?? 'Icon Symbol',
            options: SymbolOptions(I18N)
          }
        }
      ]
    }
  ]
}

function SelectedMode(className: string, I18N) {
  return {
    className,
    key: 'selectedMode',
    type: 'select',
    props: {
      label: I18N?.Common?.SelectedMode ?? 'Selected Mode',
      options: [
        { value: null, label: I18N?.Common?.SelectedMode_None ?? 'None' },
        { value: 'single', label: I18N?.Common?.SelectedMode_Single ?? 'Single' },
        { value: 'multiple', label: I18N?.Common?.SelectedMode_Multiple ?? 'Multiple' },
        { value: false, label: I18N?.Common?.SelectedMode_False ?? 'False' }
      ]
    }
  }
}
