import { AccordionWrappers, FORMLY_ROW, FORMLY_W_FULL } from '@xpert-ai/story/designer'
import { TextStyles } from './common'

export function TooltipCapacity(className: string, I18N) {
  return AccordionWrappers([
    {
      key: 'tooltip',
      label: I18N?.TOOLTIP?.TITLE ?? 'Tooltip',
      fieldGroup: [
        {
          fieldGroupClassName: FORMLY_ROW,
          fieldGroup: [
            {
              className,
              key: 'show',
              type: 'checkbox',
              props: {
                label: I18N?.Common?.Show ?? 'Show'
              }
            },
            {
              className,
              key: 'showContent',
              type: 'checkbox',
              props: {
                label: I18N?.TOOLTIP?.ShowContent ?? 'Show Content'
              }
            },
            {
              className,
              key: 'alwaysShowContent',
              type: 'checkbox',
              props: {
                label: I18N?.TOOLTIP?.AlwaysShowContent ?? 'Always Show Content'
              }
            },
            {
              className,
              key: 'triggerOn',
              type: 'select',
              props: {
                label: I18N?.TOOLTIP?.TriggerOn ?? 'Trigger On',
                options: [
                  { value: 'mousemove', label: 'Mousemove' },
                  { value: 'click', label: 'Click' },
                  { value: 'mousemove|click', label: 'Mousemove | Click' },
                  { value: 'none', label: 'None' }
                ]
              }
            },
            {
              className,
              key: 'trigger',
              type: 'select',
              props: {
                label: I18N?.TOOLTIP?.Trigger ?? 'Trigger',
                options: [
                  { value: 'item', label: 'Item' },
                  { value: 'axis', label: 'Axis' },
                  { value: 'none', label: 'None' }
                ]
              }
            },
            {
              className,
              key: 'appendToBody',
              type: 'checkbox',
              props: {
                label: I18N?.TOOLTIP?.AppendToBody ?? 'Append To Body'
              }
            },
            {
              className,
              key: 'showDelay',
              type: 'number',
              props: {
                label: I18N?.TOOLTIP?.ShowDelay ?? 'Show Delay',
              }
            },
            {
              className,
              key: 'hideDelay',
              type: 'number',
              props: {
                label: I18N?.TOOLTIP?.HideDelay ?? 'Hide Delay',
              }
            },
            {
              className,
              key: 'enterable',
              type: 'checkbox',
              props: {
                label: I18N?.TOOLTIP?.Enterable ?? 'Enterable'
              }
            },
            {
              className,
              key: 'confine',
              type: 'checkbox',
              props: {
                label: I18N?.TOOLTIP?.Confine ?? 'Confine'
              }
            },
            {
              className,
              key: 'className',
              type: 'input',
              props: {
                label: I18N?.TOOLTIP?.ClassName ?? 'Class Name',
              }
            },
            {
              className,
              key: 'transitionDuration',
              type: 'number',
              props: {
                label: I18N?.TOOLTIP?.TransitionDuration ?? 'Transition Duration',
              }
            },
            {
              className,
              key: 'position',
              type: 'json',
              props: {
                label: I18N?.TOOLTIP?.Position ?? 'Position',
                autosize: true
              }
            },
            {
              className,
              key: 'backgroundColor',
              type: 'json',
              props: {
                label: I18N?.TOOLTIP?.BackgroundColor ?? 'Background Color',
                autosize: true
              }
            },
            {
              className,
              key: 'borderColor',
              type: 'json',
              props: {
                label: I18N?.TOOLTIP?.BorderColor ?? 'Border Color',
              }
            },
            {
              className,
              key: 'borderWidth',
              type: 'number',
              props: {
                label: I18N?.TOOLTIP?.BorderWidth ?? 'Border Width',
              }
            },
            {
              className,
              key: 'padding',
              type: 'number',
              props: {
                label: I18N?.TOOLTIP?.Padding ?? 'Padding',
              }
            },
            {
              className,
              key: 'order',
              type: 'select',
              props: {
                label: I18N?.TOOLTIP?.Order ?? 'Order',
                options: [
                  { value: null, label: 'None' },
                  { value: 'seriesAsc', label: 'Series Asc' },
                  { value: 'seriesDesc', label: 'Series Desc' },
                  { value: 'valueAsc', label: 'Value Asc' },
                  { value: 'valueDesc', label: 'Value Desc' },
                ]
              }
            },
            {
              className: FORMLY_W_FULL,
              key: 'extraCssText',
              type: 'textarea',
              props: {
                label: I18N?.TOOLTIP?.ExtraCssText ?? 'Extra Css Text',
                autosize: true
              }
            },
            
          ]
        },
        AxisPointer(className, I18N),
        {
          fieldGroupClassName: FORMLY_ROW,
          key: 'textStyle',
          wrappers: ['panel'],
          props: {
            label: I18N?.TOOLTIP?.TextStyle ?? 'Text Style'
          },
          fieldGroup: TextStyles(className, I18N)
        }
      ]
    }
  ])
}

export function AxisPointer(className: string, I18N) {
  return {
    fieldGroupClassName: FORMLY_ROW,
    key: 'axisPointer',
    wrappers: ['panel'],
    props: {
      label: I18N?.TOOLTIP?.AxisPointer ?? 'Axis Pointer'
    },
    fieldGroup: [
      {
        className,
        key: 'type',
        type: 'select',
        props: {
          label: I18N?.TOOLTIP?.Type ?? 'Type',
          options: [
            { value: 'line', label: 'Line' },
            { value: 'shadow', label: 'Shadow' },
            { value: 'cross', label: 'Cross' },
            { value: 'none', label: 'None' }
          ]
        }
      },
      {
        className,
        key: 'axis',
        type: 'select',
        props: {
          label: I18N?.TOOLTIP?.Axis ?? 'Axis',
          options: [
            { value: 'auto', label: 'Auto' },
            { value: 'x', label: 'X Axis' },
            { value: 'y', label: 'Y Axis' },
            { value: 'radius', label: 'Radius Axis' },
            { value: 'angle', label: 'Angle Axis' }
          ]
        }
      },
      {
        className,
        key: 'snap',
        type: 'checkbox',
        props: {
          label: I18N?.TOOLTIP?.Snap ?? 'Snap'
        }
      }
    ]
  }
}
