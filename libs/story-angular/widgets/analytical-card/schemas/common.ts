import { AccordionWrappers, FORMLY_ROW, FORMLY_W_FULL } from '@xpert-ai/story/designer'
import { LineStyle } from './axis'

export function ItemStyle(className: string, I18N) {
  return {
    key: 'itemStyle',
    wrappers: ['panel'],
    props: {
      label: I18N?.ItemStyle?.Title ?? 'Item Style'
    },
    fieldGroup: [
      {
        fieldGroupClassName: FORMLY_ROW,
        fieldGroup: [
          SingleColor(className, I18N),
          ...Borders(className, I18N),

          // for CanvasRenderingContext2D
          {
            className,
            key: 'borderCap',
            type: 'select',
            props: {
              label: I18N?.Common?.BorderCap ?? 'Border Cap',
              placeholder: 'lineCap',
              options: [
                { value: null, label: 'None' },
                { value: 'butt', label: 'butt' },
                { value: 'round', label: 'round' },
                { value: 'square', label: 'square' }
              ]
            }
          },
          {
            className,
            key: 'borderJoin',
            type: 'select',
            props: {
              label: I18N?.Common?.BorderJoin ?? 'Border Join',
              placeholder: 'lineJoin',
              options: [
                { value: null, label: 'None' },
                { value: 'bevel', label: 'bevel' },
                { value: 'round', label: 'round' },
                { value: 'miter', label: 'miter' }
              ]
            }
          },
          {
            className,
            key: 'borderMiterLimit',
            type: 'input',
            props: {
              label: I18N?.Common?.BorderMiterLimit ?? 'Border Miter Limit',
              placeholder: 'Default is 10.0',
              type: 'number'
            }
          },

          ...Shadows('ngm-formly__col ngm-formly__col-6', I18N),
          Opacity(className, I18N)
        ]
      }
    ]
  }
}

export function ItemStyleAccordionWrappers(className: string, I18N, extensions?) {
  return AccordionWrappers([
    {
      key: 'itemStyle',
      label: I18N?.ItemStyle?.Title ?? 'Item Style',
      fieldGroup: [
        {
          fieldGroupClassName: FORMLY_ROW,
          fieldGroup: [
            {
              className,
              key: 'color',
              type: 'json',
              props: {
                label: I18N?.Common?.Color ?? 'Color',
                placeholder: `color`,
                autosize: true
              }
            },
            ...Borders(className, I18N),

            // for CanvasRenderingContext2D
            {
              className,
              key: 'borderCap',
              type: 'select',
              props: {
                label: I18N?.Common?.BorderCap ?? 'Border Cap',
                placeholder: 'lineCap',
                options: [
                  { value: null, label: 'None' },
                  { value: 'butt', label: 'butt' },
                  { value: 'round', label: 'round' },
                  { value: 'square', label: 'square' }
                ]
              }
            },
            {
              className,
              key: 'borderJoin',
              type: 'select',
              props: {
                label: I18N?.Common?.BorderJoin ?? 'Border Join',
                placeholder: 'lineJoin',
                options: [
                  { value: null, label: 'None' },
                  { value: 'bevel', label: 'bevel' },
                  { value: 'round', label: 'round' },
                  { value: 'miter', label: 'miter' }
                ]
              }
            },
            {
              className,
              key: 'borderMiterLimit',
              type: 'input',
              props: {
                label: I18N?.Common?.BorderMiterLimit ?? 'Border Miter Limit',
                placeholder: 'Default: 10.0',
                type: 'number'
              }
            },

            ...Shadows(className, I18N),
            Opacity(className, I18N),

            ...(extensions ?? [])
          ]
        }
      ]
    }
  ])
}

export function SeriesDataSet(I18N) {
  return [
    {
      className: 'ngm-formly__col ngm-formly__col-12',
      key: 'seriesLayoutBy',
      type: 'button-toggle',
      props: {
        label: I18N?.Common?.SeriesLayoutBy ?? 'Series Layout By',
        options: [
          { value: null, label: I18N?.Common?.Auto ?? 'Auto' },
          { value: 'column', label: I18N?.Common?.Column ?? 'Column' },
          { value: 'row', label: I18N?.Common?.Row ?? 'Row' }
        ]
      }
    }

    // 不能在统一样式属性里指定
    // {
    //   className: 'ngm-formly__col ngm-formly__col-6',
    //   key: 'datasetIndex',
    //   type: 'input',
    //   props: {
    //     label: 'DatasetIndex',
    //     options: [
    //       { value: null, label: 'auto' },
    //       { value: 'column', label: 'Column' },
    //       { value: 'row', label: 'Row' }
    //     ]
    //   }
    // },
  ]
}

export function UniversalTransition(className: string, I18N) {
  return {
    className,
    key: 'universalTransition',
    type: 'checkbox',
    props: {
      label: I18N?.Common?.UniversalTransition ?? 'Universal Transition'
    }
  }
}

export function SeriesCommon(className: string, I18N) {
  return {
    fieldGroupClassName: FORMLY_ROW,
    fieldGroup: [
      UniversalTransition(className, I18N),
      {
        className,
        key: 'silent',
        type: 'checkbox',
        props: {
          label: I18N?.Common?.Silent ?? 'Silent'
        }
      },
      {
        className,
        key: 'cursor',
        type: 'select',
        props: {
          label: I18N?.Common?.Cursor ?? 'Cursor',
          options: [
            { value: null, label: I18N?.Common?.Cursor_Auto ?? 'Auto' },
            { value: 'pointer', label: I18N?.Common?.Cursor_Pointer ?? 'Pointer' },
            { value: 'move', label: I18N?.Common?.Cursor_Move ?? 'Move' }
          ]
        }
      },
      ColorBy(className, I18N),
      SelectedMode(className, I18N)
    ]
  }
}

export function SelectedMode(className: string, I18N) {
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
        { value: 'series', label: I18N?.Common?.SelectedMode_Series ?? 'Series' }
      ]
    }
  }
}

export function SelectAccordionWrappers(className: string, I18N) {
  return AccordionWrappers([
    {
      key: 'select',
      label: I18N?.Select?.Title ?? 'Select',
      fieldGroup: [
        {
          key: 'disabled',
          type: 'toggle',
          props: {
            label: I18N?.Common?.Disabled ?? 'Disabled'
          }
        },
        ItemStyle(className, I18N)
      ]
    }
  ])
}

export function MarkLineAccordionWrappers(className: string, I18N) {
  return AccordionWrappers([
    {
      key: 'markLine',
      label: I18N?.MarkLine?.Title ?? 'Mark Line',
      fieldGroup: [
        {
          fieldGroupClassName: FORMLY_ROW,
          fieldGroup: [
            {
              className,
              key: 'silent',
              type: 'checkbox',
              props: {
                label: I18N?.Common?.Silent ?? 'Silent'
              }
            }
          ]
        },
        {
          key: 'lineStyle',
          wrappers: ['panel'],
          fieldGroupClassName: FORMLY_ROW,
          props: {
            label: I18N?.MarkLine?.LineStyle ?? 'Line Style'
          },
          fieldGroup: LineStyle(className, I18N)
        }
      ]
    }
  ])
}

export function Shadows(className: string, I18N?) {
  return [
    {
      className,
      key: 'shadowColor',
      type: 'color',
      props: {
        label: I18N?.SHADOW?.SHADOW_COLOR ?? 'Shadow Color',
        placeholder: 'shadowColor'
      }
    },
    {
      className,
      key: 'shadowBlur',
      type: 'input',
      props: {
        label: I18N?.SHADOW?.SHADOW_BLUR ?? 'Shadow Blur',
        placeholder: 'shadowBlur'
      }
    },
    {
      className,
      key: 'shadowOffsetX',
      type: 'input',
      props: {
        label: I18N?.SHADOW?.SHADOW_OFFSETX ?? 'Shadow OffsetX',
        type: 'number',
        placeholder: 'shadowOffsetX'
      }
    },
    {
      className,
      key: 'shadowOffsetY',
      type: 'input',
      props: {
        label: I18N?.SHADOW?.SHADOW_OFFSETY ?? 'Shadow OffsetY',
        type: 'number',
        placeholder: 'shadowOffsetY'
      }
    }
  ]
}

export function EmphasisAccordionWrappers(className: string, I18N, extensions?: any[]) {
  return AccordionWrappers([
    {
      key: 'emphasis',
      label: I18N?.EMPHASIS?.TITLE ?? 'Emphasis',
      fieldGroup: [
        ...Emphasis(className, I18N).fieldGroup,
        ...(extensions ?? [])
      ]
    }
  ])
}

export function Emphasis(className: string, I18N) {
  return {
    key: 'emphasis',
    props: {
      label: I18N?.EMPHASIS?.TITLE ?? 'Emphasis',
      icon: 'announcement',
      toggleable: true
    },
    fieldGroup: [
      {
        fieldGroupClassName: FORMLY_ROW,
        fieldGroup: [
          {
            className,
            key: 'disabled',
            type: 'checkbox',
            props: {
              label: I18N?.EMPHASIS?.DISABLED ?? 'Disabled'
            }
          },
          {
            className,
            key: 'scale',
            type: 'checkbox',
            props: {
              label: I18N?.EMPHASIS?.Scale ?? 'Scale',
            }
          },
          {
            className,
            key: 'scaleSize',
            type: 'number',
            props: {
              label: I18N?.EMPHASIS?.ScaleSize ?? 'Scale Size',
            },
            expressions: {
              hide: `!model || !model.scale`
            }
          },
          Focus(className, I18N),
          BlurScope(className, I18N),
        ]
      },
      ItemStyle(className, I18N),
    ]
  }
}

export function Positions(className: string, I18N) {
  return [
    {
      className,
      key: 'top',
      type: 'input-inline',
      props: {
        label: I18N?.Common?.TOP ?? 'Top',
        placeholder: 'top',
        options: [
          {
            value: null,
            label: I18N?.Common?.None ?? 'None'
          },
          {
            value: 'auto',
            label: I18N?.Common?.Position_Auto ?? 'Auto'
          },
          {
            value: 'top',
            label: I18N?.Common?.Position_Top ?? 'Top'
          },
          {
            value: 'middle',
            label: I18N?.Common?.Position_Middle ?? 'Middle'
          },
          {
            value: 'bottom',
            label: I18N?.Common?.Position_Bottom ?? 'Bottom'
          },
          {
            value: '20%',
            label: '20%'
          },
          {
            value: '50%',
            label: '50%'
          },
          {
            value: '80%',
            label: '80%'
          },
          {
            value: '50',
            label: '50px'
          },
          {
            value: '100',
            label: '100px'
          }
        ]
      }
    },
    {
      className,
      key: 'right',
      type: 'input-inline',
      props: {
        label: I18N?.Common?.RIGHT ?? 'Right',
        placeholder: 'right',
        options: [
          {
            value: null,
            label: I18N?.Common?.None ?? 'None'
          },
          {
            value: 'auto',
            label: I18N?.Common?.Position_Auto ?? 'Auto'
          },
          {
            value: 'left',
            label: I18N?.Common?.Position_Left ?? 'Left'
          },
          {
            value: 'center',
            label: I18N?.Common?.Position_Center ?? 'Center'
          },
          {
            value: 'right',
            label: I18N?.Common?.Position_Right ?? 'Right'
          },
          {
            value: '20%',
            label: '20%'
          },
          {
            value: '50%',
            label: '50%'
          },
          {
            value: '80%',
            label: '80%'
          },
          {
            value: '50',
            label: '50px'
          },
          {
            value: '100',
            label: '100px'
          }
        ]
      }
    },
    {
      className,
      key: 'bottom',
      type: 'input-inline',
      props: {
        label: I18N?.Common?.BOTTOM ?? 'Bottom',
        placeholder: 'bottom',
        options: [
          {
            value: null,
            label: I18N?.Common?.None ?? 'None'
          },
          {
            value: 'auto',
            label: I18N?.Common?.Position_Auto ?? 'Auto'
          },
          {
            value: 'top',
            label: I18N?.Common?.Position_Top ?? 'Top'
          },
          {
            value: 'middle',
            label: I18N?.Common?.Position_Middle ?? 'Middle'
          },
          {
            value: 'bottom',
            label: I18N?.Common?.Position_Bottom ?? 'Bottom'
          },
          {
            value: '20%',
            label: '20%'
          },
          {
            value: '50%',
            label: '50%'
          },
          {
            value: '80%',
            label: '80%'
          },
          {
            value: '50',
            label: '50px'
          },
          {
            value: '100',
            label: '100px'
          }
        ]
      }
    },
    {
      className,
      key: 'left',
      type: 'input-inline',
      props: {
        label: I18N?.Common?.LEFT ?? 'Left',
        placeholder: 'left',
        options: [
          {
            value: null,
            label: I18N?.Common?.None ?? 'None'
          },
          {
            value: 'auto',
            label: I18N?.Common?.Position_Auto ?? 'Auto'
          },
          {
            value: 'left',
            label: I18N?.Common?.Position_Left ?? 'Left'
          },
          {
            value: 'center',
            label: I18N?.Common?.Position_Center ?? 'Center'
          },
          {
            value: 'right',
            label: I18N?.Common?.Position_Right ?? 'Right'
          },
          {
            value: '20%',
            label: '20%'
          },
          {
            value: '50%',
            label: '50%'
          },
          {
            value: '80%',
            label: '80%'
          },
          {
            value: '50',
            label: '50px'
          },
          {
            value: '100',
            label: '100px'
          }
        ]
      }
    }
  ]
}

export function Orient(className: string, I18N?) {
  return {
    className,
    key: 'orient',
    type: 'select-inline',
    props: {
      label: I18N?.Common?.Orient ?? 'Orient',
      options: [
        { value: null, label: I18N?.Common?.None ?? 'None' },
        { value: 'horizontal', label: I18N?.Common?.Horizontal ?? 'Horizontal' },
        { value: 'vertical', label: I18N?.Common?.Vertical ?? 'Vertical' }
      ]
    }
  }
}

export function Opacity(className, I18N) {
  return {
    className,
    key: 'opacity',
    type: 'slider',
    props: {
      label: I18N?.Common?.Opacity ?? 'Opacity',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.01,
      thumbLabel: true
    }
  }
}

export function PaddingJSON(className, I18N) {
  return {
    className,
    key: 'padding',
    type: 'json',
    props: {
      label: I18N?.Common?.Padding ?? 'Padding',
      placeholder: `number | [number, number] | ...`,
      autosize: true
    }
  }
}

export function WidthHeight(className: string, I18N) {
  return [
    {
      className,
      key: 'width',
      type: 'input-inline',
      props: {
        type: 'number',
        label: I18N?.Common?.Width ?? 'Width',
        placeholder: `width`
      }
    },

    {
      className,
      key: 'height',
      type: 'input-inline',
      props: {
        type: 'number',
        label: I18N?.Common?.Height ?? 'Height',
        placeholder: `height`
      }
    }
  ]
}

export function Rotate(className: string, I18N) {
  return {
    className,
    key: 'rotate',
    type: 'input',
    props: {
      label: I18N?.Common?.Rotate ?? 'Rotate',
      type: 'number',
      placeholder: `rotate: -90 ~ 90`
    }
  }
}

export function TextBorderShadow(className: string, I18N) {
  return [
    {
      className,
      key: 'textBorderColor',
      type: 'color',
      props: {
        label: I18N?.Text?.TextBorderColor ?? 'Text Border Color',
        type: 'number',
        placeholder: `textBorderColor`
      }
    },
    {
      className,
      key: 'textBorderWidth',
      type: 'input',
      props: {
        label: I18N?.Text?.TextBorderWidth ?? 'Text Border Width',
        type: 'number',
        placeholder: `textShadowColor`
      }
    },
    {
      className,
      key: 'textBorderType',
      type: 'select',
      props: {
        label: I18N?.Text?.TextBorderType ?? 'Text Border Type',
        options: LineTypeOptions(I18N),
        placeholder: `textBorderType`
      }
    },
    {
      className,
      key: 'textBorderDashOffset',
      type: 'input',
      props: {
        label: I18N?.Text?.TextBorderDashOffset ?? 'Text Border Dash Offset',
        type: 'number',
        placeholder: `textBorderDashOffset`
      }
    },

    {
      className,
      key: 'textShadowColor',
      type: 'color',
      props: {
        label: I18N?.Text?.TextShadowColor ?? 'Text Shadow Color',
        placeholder: `textShadowColor`
      }
    },
    {
      className,
      key: 'textShadowBlur',
      type: 'input',
      props: {
        label: I18N?.Text?.TextShadowBlur ?? 'Text Shadow Blur',
        type: 'number',
        placeholder: `textShadowBlur`
      }
    },
    {
      className,
      key: 'textShadowOffsetX',
      type: 'input',
      props: {
        label: I18N?.Text?.TextShadowOffsetX ?? 'Text Shadow OffsetX',
        type: 'number',
        placeholder: `textShadowOffsetX`
      }
    },
    {
      className,
      key: 'textShadowOffsetY',
      type: 'input',
      props: {
        label: I18N?.Text?.TextShadowOffsetY ?? 'Text Shadow OffsetY',
        type: 'number',
        placeholder: `textShadowOffsetY`
      }
    },
  ]
}

export function TextOverflow(className: string, I18N) {
  return [
    {
      className,
      key: 'overflow',
      type: 'select',
      props: {
        label: I18N?.Text?.Overflow ?? 'Overflow',
        options: [
          { value: null, label: I18N?.Text?.Overflow_Null ?? 'None' },
          { value: 'truncate', label: I18N?.Text?.Overflow_Truncate ?? 'Truncate' },
          { value: 'break', label: I18N?.Text?.Overflow_Break ?? 'Break' },
          { value: 'breakAll', label: I18N?.Text?.Overflow_BreakAll ?? 'Break All' }
        ]
      }
    },
    {
      className,
      key: 'ellipsis',
      type: 'checkbox',
      hideExpression: `!model || model.overflow !== 'truncate'`,
      props: {
        label: I18N?.Text?.Ellipsis ?? 'Ellipsis'
      }
    }
  ]
}

export function LineTypeOptions(I18N) {
  return [
    { value: null, label: I18N?.LineStyle?.None ?? 'None' },
    { value: 'solid', label: I18N?.LineStyle?.Solid ?? 'Solid' },
    { value: 'dashed', label: I18N?.LineStyle?.Dashed ?? 'Dashed' },
    { value: 'dotted', label: I18N?.LineStyle?.Dotted ?? 'Dotted' }
  ]
}

export function SingleColor(className: string, I18N) {
  return {
    className,
    key: 'color',
    type: 'color',
    props: {
      label: I18N?.Common?.Color ?? 'Color',
      placeholder: `color`
    }
  }
}

export function ColorJSON(className: string, I18N) {
  return {
    className,
    key: 'color',
    type: 'json',
    props: {
      label: I18N?.Common?.Color ?? 'Color',
      autosize: true
    }
  }
}

export function Borders(className: string, I18N) {
  return [
    {
      className,
      key: 'borderColor',
      type: 'color',
      props: {
        label: I18N?.Common?.BorderColor ?? 'Border Color',
        placeholder: `borderColor`
      }
    },
    {
      className,
      key: 'borderWidth',
      type: 'slider',
      props: {
        label: I18N?.Common?.BorderWidth ?? 'Border Width',
        type: 'number',
        placeholder: `borderWidth`,
        thumbLabel: true,
        autoScale: true
      }
    },

    {
      className,
      key: 'borderType',
      type: 'select',
      props: {
        label: I18N?.Common?.BorderType ?? 'Border Type',
        options: LineTypeOptions(I18N)
      }
    },
    {
      className,
      key: 'borderRadius',
      type: 'slider',
      props: {
        label: I18N?.Common?.BorderRadius ?? 'Border Radius',
        type: 'number',
        placeholder: `borderRadius`,
        thumbLabel: true,
        autoScale: true
      }
    },
  ]
}

export function SymbolOptions(I18N) {
  return [
    { value: null, label: 'None' },
    { value: 'emptyCircle', label: 'Empty Circle' },
    { value: 'circle', label: 'Circle' },
    { value: 'rect', label: 'Rect' },
    { value: 'roundRect', label: 'RoundRect' },
    { value: 'triangle', label: 'Triangle' },
    { value: 'diamond', label: 'Diamond' },
    { value: 'pin', label: 'Pin' },
    { value: 'arrow', label: 'Arrow' }
  ]
}

export function Symbols(className: string, I18N) {
  return [
    {
      className,
      key: 'symbol',
      type: 'select',
      props: {
        label: I18N?.Common?.Symbol ?? 'Symbol',
        options: SymbolOptions(I18N)
      }
    },

    {
      className,
      key: 'symbolSize',
      type: 'input',
      props: {
        label: I18N?.Common?.SymbolSize ?? 'Symbol Size',
        type: 'number'
      }
    },

    {
      className,
      key: 'symbolRotate',
      type: 'input',
      props: {
        label: I18N?.Common?.SymbolRotate ?? 'Symbol Rotate',
        type: 'number'
      }
    },

    {
      className,
      key: 'symbolOffset',
      type: 'input',
      props: {
        label: I18N?.Common?.SymbolOffset ?? 'Symbol Offset',
        type: 'number'
      }
    },
  ]
}

/**
 * 堆积相关属性
 * 
 * @param className 
 * @param I18N 
 * @returns 
 */
export function Stacks(className: string, I18N) {
  return [
    {
      className,
      key: 'stack',
      type: 'input',
      props: {
        label: I18N?.Common?.Stack ?? 'Stack'
      }
    },
  ]
}

export function FontStyles(className: string, I18N) {
  return [
    {
      className,
      key: 'color',
      type: 'color',
      props: {
        label: I18N?.Text?.Color ?? 'Color'
      }
    },
    {
      className,
      key: 'fontStyle',
      type: 'select',
      props: {
        label: I18N?.Text?.FontStyle ?? 'Font Style',
        options: [
          {
            value: null,
            label: I18N?.Text?.FontStyle_Auto ?? 'Auto'
          },
          {
            value: 'normal',
            label: I18N?.Text?.FontStyle_Normal ?? 'Normal'
          },
          {
            value: 'italic',
            label: I18N?.Text?.FontStyle_Italic ?? 'Italic'
          },
          {
            value: 'oblique',
            label: I18N?.Text?.FontStyle_Oblique ?? 'Oblique'
          },
        ]
      }
    },
    {
      className,
      key: 'fontWeight',
      type: 'input',
      props: {
        label: I18N?.Text?.FontWeight ?? 'Font Weight',
        placeholder: `normal|bold|bolder|lighter|100|200|...`
      }
    },
    {
      className,
      key: 'fontFamily',
      type: 'input',
      props: {
        label: I18N?.Text?.FontFamily ?? 'Font Family',
        placeholder: `'serif','monospace', ...`
      }
    },
    {
      className,
      key: 'fontSize',
      type: 'input',
      props: {
        label: I18N?.Text?.FontSize ?? 'Font Size',
        type: 'number',
        placeholder: `fontSize`
      }
    },
    {
      className,
      key: 'lineHeight',
      type: 'input',
      props: {
        label: I18N?.Text?.LineHeight ?? 'Line Height',
        type: 'number',
        placeholder: `lineHeight`
      }
    },
  ]
}

export function Aligns(className: string, I18N) {
  return [
    {
      className,
      key: 'align',
      type: 'select',
      props: {
        label: I18N?.Text?.Align ?? 'Align',
        options: [
          { value: null, label: I18N?.Text?.Align_Auto ?? 'Auto' },
          { value: 'left', label: I18N?.Text?.Align_Left ?? 'Left' },
          { value: 'center', label: I18N?.Text?.Align_Center ?? 'Center' },
          { value: 'right', label: I18N?.Text?.Align_Right ?? 'Right' }
        ]
      }
    },
    {
      className,
      key: 'verticalAlign',
      type: 'select',
      props: {
        label: I18N?.Text?.VerticalAlign ?? 'Vertical Align',
        options: [
          {
            value: null,
            label: I18N?.Text?.VerticalAlign_Auto ?? 'Auto'
          },
          {
            value: 'top',
            label: I18N?.Text?.VerticalAlign_Top ?? 'Top'
          },
          {
            value: 'middle',
            label: I18N?.Text?.VerticalAlign_Middle ?? 'Middle'
          },
          {
            value: 'bottom',
            label: I18N?.Text?.VerticalAlign_Bottom ?? 'Bottom'
          },
        ]
      }
    }
  ]
}

export function LegendHoverLink(className: string, I18N) {
  return {
    className,
    key: 'legendHoverLink',
    type: 'checkbox',
    props: {
      label: I18N?.Common?.LegendHoverLink ?? 'Legend Hover Link'
    }
  }
}

export function ColorBy(className: string, I18N) {
  return {
    className,
    key: 'colorBy',
    type: 'select',
    props: {
      label: I18N?.Common?.ColorBy ?? 'Color By',
      options: [
        { value: null, label: I18N?.Common?.ColorBy_Auto ?? 'auto' },
        { value: 'series', label: I18N?.Common?.ColorBy_SameSeries ?? 'Same Seris' },
        { value: 'data', label: I18N?.Common?.ColorBy_DataItems ?? 'Data Items' }
      ]
    }
  }
}

/**
 * Field Group for text styles
 * 
 * @param className 
 * @param I18N 
 * @returns 
 */
export function TextStyles(className: string, I18N) {
  return [
    SingleColor(className, I18N),
    ...FontStyles(className, I18N),
    {
      className,
      key: 'backgroundColor',
      type: 'input',
      props: {
        label: I18N?.Global?.BackgroundColor ?? 'Background Color'
      }
    },
    ...Borders(className, I18N),
    ...Shadows(className, I18N),
    ...WidthHeight(className, I18N),
    ...TextBorderShadow(className, I18N),
    ...TextOverflow(className, I18N),
    {
      className: FORMLY_W_FULL,
      key: 'rich',
      type: 'json',
      props: {
        label: I18N?.Text?.RichText ?? 'Rich Text',
        autosize: true
      }
    }
  ]
}

export function Levels(className, I18N) {
  return {
    className,
    key: 'levels',
    type: 'json',
    props: {
      label: I18N?.Treemap?.LevelsOptions || 'Levels Options',
      placeholder: 'levels',
      autosize: true,
      autosizeMaxRows: 10
    }
  }
}

export function Focus(className: string, I18N, {adjacency} = {adjacency: false}) {
  const options = [
    { value: null, label: I18N?.EMPHASIS?.Focus_None ?? 'None' },
    { value: 'self', label: I18N?.EMPHASIS?.Focus_Self ?? 'Self' },
    { value: 'series', label: I18N?.EMPHASIS?.Focus_Series ?? 'Series' },
  ]

  if (adjacency) {
    options.push({ value: 'adjacency', label: I18N?.EMPHASIS?.Focus_Adjacency ?? 'Adjacency' })
  }
  return {
    className,
    key: 'focus',
    type: 'select',
    props: {
      label: I18N?.EMPHASIS?.FOCUS ?? 'Focus',
      options
    }
  }
}

export function BlurScope(className: string, I18N) {
  return       {
    className,
    key: 'blurScope',
    type: 'select',
    props: {
      label: I18N?.EMPHASIS?.BlurScope ?? 'Blur Scope',
      options: [
        { value: null, label: I18N?.EMPHASIS?.BlurScope_None ?? 'None' },
        { value: 'coordinateSystem', label: I18N?.EMPHASIS?.BlurScope_CoordinateSystem ?? 'Coordinate System' },
        { value: 'series', label: I18N?.EMPHASIS?.BlurScope_Series ?? 'Series' },
        { value: 'global', label: I18N?.EMPHASIS?.BlurScope_Global ?? 'Global' },
      ]
    }
  }
}

export function AreaStyles(className: string, I18N) {
  return [
    {
      className: FORMLY_W_FULL,
      key: 'color',
      type: 'json',
      props: {
        label: I18N?.Common?.Color ?? 'Color',
        autosize: true
      }
    },
    {
      className,
      key: 'origin',
      type: 'select',
      props: {
        label: I18N?.Line?.Origin ?? 'Origin',
        options: [
          { value: 'auto', label: 'Auto' },
          { value: 'start', label: 'Start' },
          { value: 'end', label: 'End' }
        ]
      }
    },
    Opacity(className, I18N),
    ...Shadows(className, I18N)
  ]
}

export function BackgroundStyleAccordionWrappers(className: string, I18N, extensions?: any[]) {
  return AccordionWrappers([
    {
      key: 'backgroundStyle',
      label: I18N?.Bar?.Background ?? 'Background',
      fieldGroup: [
        SingleColor(className, I18N),
        ...Borders(className, I18N),
        ...Shadows(className, I18N),
        Opacity(className, I18N),
        ...(extensions ?? [])
      ]
    }
  ])
}
