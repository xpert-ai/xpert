import { ChartDataZoomType } from '@xpert-ai/ocap-core'
import { AccordionWrappers, FORMLY_ROW } from '@xpert-ai/story/designer'
import { Positions, WidthHeight } from './common'

export function DataZoomCapacity(className: string, I18N?) {
  const dataZoomI18n = I18N?.DATAZOOM_STYLE

  return AccordionWrappers([
    {
      key: 'dataZoom',
      label: dataZoomI18n?.DATAZOOM ?? 'Data Zoom',
      fieldGroup: [
        {
          fieldGroupClassName: FORMLY_ROW,
          fieldGroup: DataZoomAttributes(className, I18N)
        }
      ]
    }
  ])
}

export function DataZoomAttributes(className: string, I18N) {
  const dataZoomI18n = I18N?.DATAZOOM_STYLE
  return [
    {
      className,
      key: 'type',
      type: 'select-inline',
      props: {
        label: dataZoomI18n?.DATAZOOM_TYPE ?? 'Type',
        options: [
          { value: null, label: dataZoomI18n?.Type_none ?? 'None' },
          { value: ChartDataZoomType.inside, label: dataZoomI18n?.Type_inside ?? 'Inside' },
          { value: ChartDataZoomType.slider, label: dataZoomI18n?.Type_slider ?? 'Slider' },
          { value: ChartDataZoomType.inside_slider, label: dataZoomI18n?.Type_sliderInside ?? 'Inside & Slider' }
        ]
      }
    },
    {
      className,
      key: 'orient',
      type: 'select-inline',
      props: {
        label: dataZoomI18n?.ORIENT ?? 'Orient',
        options: [
          { value: null, label: dataZoomI18n?.None ?? 'None' },
          { value: 'horizontal', label: dataZoomI18n?.ORIENT_HORIZONTAL ?? 'Horizontal' },
          { value: 'vertical', label: dataZoomI18n?.ORIENT_VERTICAL ?? 'Vertical' }
        ]
      }
    },
    ...Positions(className, I18N),
    ...WidthHeight(className, I18N),
    {
      className,
      key: 'filterMode',
      type: 'select-inline',
      props: {
        label: dataZoomI18n?.FILTER_MODE ?? 'Filter Mode',
        options: [
          { value: null, label: I18N?.Common?.None ?? 'Default' },
          { value: 'filter', label: 'Filter' },
          { value: 'weakFilter', label: 'WeakFilter' },
          { value: 'empty', label: 'Empty' },
          { value: 'none', label: 'None' }
        ]
      }
    },
    {
      className,
      key: 'rangeMode',
      type: 'select-inline',
      props: {
        label: dataZoomI18n?.RangeMode ?? 'Range Mode',
        options: [
          {
            value: null,
            label: 'Default'
          },
          {
            value: ['percent', 'percent'],
            label: `['percent', 'percent']`
          },
          {
            value: ['value', 'percent'],
            label: `['value', 'percent']`
          },
          {
            value: ['percent', 'value'],
            label: `['percent', 'value']`
          },
          {
            value: ['value', 'value'],
            label: `['value', 'value']`
          }
        ]
      }
    },
    {
      className,
      key: 'start',
      type: 'input-inline',
      props: {
        label: dataZoomI18n?.START ?? 'Start',
        type: 'number',
      }
    },
    {
      className,
      key: 'end',
      type: 'input-inline',
      props: {
        label: dataZoomI18n?.END ?? 'End',
        type: 'number',
      }
    },
    {
      className,
      key: 'startValue',
      type: 'input-inline',
      props: {
        label: dataZoomI18n?.START_VALUE ?? 'Start Value'
      },
      expressions: {
        hide: `!model || model.start !== null && model.start !== undefined`
      }
    },
    {
      className,
      key: 'endValue',
      type: 'input-inline',
      props: {
        label: dataZoomI18n?.END_VALUE ?? 'End Value'
      },
      expressions: {
        hide: `!model || model.end !== null && model.end !== undefined`
      }
    },
    {
      className,
      key: 'minSpan',
      type: 'slider',
      props: {
        label: dataZoomI18n?.MIN_SPAN ?? 'Min Span',
        type: 'number',
        placeholder: '0 ~ 100',
        thumbLabel: true,
      }
    },
    {
      className,
      key: 'maxSpan',
      type: 'slider',
      props: {
        label: dataZoomI18n?.MAX_SPAN ?? 'Max Span',
        type: 'number',
        placeholder: '0 ~ 100',
        thumbLabel: true,
      }
    },
    {
      className,
      key: 'minValueSpan',
      type: 'input-inline',
      props: {
        label: dataZoomI18n?.MinValueSpan ?? 'Min Value Span'
      }
    },
    {
      className,
      key: 'maxValueSpan',
      type: 'input-inline',
      props: {
        label: dataZoomI18n?.MaxValueSpan ?? 'Max Value Span'
      }
    },
    {
      className,
      key: 'zoomLock',
      type: 'checkbox',
      props: {
        label: dataZoomI18n?.ZOOM_LOCK ?? 'Zoom Lock'
      }
    },
    {
      className,
      key: 'throttle',
      type: 'input-inline',
      props: {
        label: dataZoomI18n?.Throttle ?? 'Throttle',
        placeholder: 'ms',
        type: 'number',
      }
    },
    {
      className,
      key: 'preventDefaultMouseMove',
      type: 'checkbox',
      props: {
        label: dataZoomI18n?.PreventDefaultMouseMove ?? 'Prevent Default Mouse Move'
      }
    },
    MouseMode('zoomOnMouseWheel', dataZoomI18n?.zoomOnMouseWheel ?? 'Zoom On Mouse Wheel', className, dataZoomI18n),
    MouseMode('moveOnMouseMove', dataZoomI18n?.moveOnMouseMove ?? 'Move on Mouse Move', className, dataZoomI18n),
    MouseMode('moveOnMouseWheel ', dataZoomI18n?.moveOnMouseWheel ?? 'Move on Mouse Wheel ', className, dataZoomI18n)
  ]
}

export function MouseMode(key: string, label: string, className: string, I18N) {
  return {
    className,
    key,
    type: 'select-inline',
    props: {
      label,
      options: [
        { value: true, label: I18N?.MouseMode_true ?? 'True' },
        { value: false, label: I18N?.MouseMode_false ?? 'False' },
        { value: 'shift', label: I18N?.MouseMode_shift ?? 'Shift' },
        { value: 'ctrl', label: I18N?.MouseMode_ctrl ?? 'Ctrl' },
        { value: 'alt', label: I18N?.MouseMode_alt ?? 'Alt' }
      ]
    }
  }
}
