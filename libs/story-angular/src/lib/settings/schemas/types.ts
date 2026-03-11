import { DisplayBehaviour } from '@metad/ocap-core'
import { GridType } from 'angular-gridster2'

export function gridsterOptions(className: string, I18NGridOptions) {
  return [
    {
      key: 'gridType',
      type: 'select-inline',
      className,
      props: {
        label: I18NGridOptions?.GRID_TYPE ?? 'Grid Type',
        displayBehaviour: DisplayBehaviour.descriptionOnly,
        options: [
          {
            value: GridType.Fit,
            label: I18NGridOptions?.Type_FittoScreen ?? 'Fit to Screen',
            icon: 'fit_screen' },
          // 解决不了 ScrollVertical 滚动与全屏的问题
          // {
          //   value: GridType.ScrollVertical,
          //   label: 'Scroll Vertical',
          //   icon: 'swap_vert'
          // },
          // {
          //   value: GridType.ScrollHorizontal,
          //   label: 'Scroll Horizontal',
          //   icon: 'swap_horiz'
          // },
          {
            value: GridType.Fixed,
            label: I18NGridOptions?.Type_Fixed ?? 'Fixed',
            icon: 'fullscreen'
          },
          {
            value: GridType.VerticalFixed,
            label: I18NGridOptions?.Type_VerticalFixed ?? 'Vertical Fixed',
            icon: 'vertical_distribute'
          },
          {
            value: GridType.HorizontalFixed,
            label: I18NGridOptions?.Type_HorizontalFixed ?? 'Horizontal Fixed',
            icon: 'horizontal_distribute'
          }
        ]
      }
    },
    {
      key: 'setGridSize',
      type: 'checkbox',
      className,
      props: {
        label: I18NGridOptions?.SetGridSize ?? 'Set Grid Size'
      },
      expressions: {
        hide: `!model || model.gridType !== 'fixed'`
      }
    },

    {
      className,
      key: 'fixedColWidth',
      type: 'slider',
      props: {
        label: I18NGridOptions?.FixedColumnWidth ?? 'Fixed Column Width',
        placeholder: 'fixedColWidth',
        type: 'number',
        min: 1,
        max: 100,
        thumbLabel: true,
        autoScale: true,
        color: 'accent'
      }
    },
    {
      className,
      key: 'fixedRowHeight',
      type: 'slider',
      props: {
        label: I18NGridOptions?.FixedRowHeight ?? 'Fixed Row Height',
        placeholder: 'fixedRowHeight',
        type: 'number',
        min: 1,
        max: 100,
        thumbLabel: true,
        autoScale: true }
    },
    {
      className,
      key: 'minCols',
      type: 'slider',
      props: {
        label: I18NGridOptions?.MinCols ?? 'Min Cols',
        placeholder: I18NGridOptions?.MinColsDefault ?? 'Default 10',
        type: 'number',
        min: 1,
        max: 100,
        thumbLabel: true,
        autoScale: true }
    },
    {
      className,
      key: 'minRows',
      type: 'slider',
      props: {
        label: I18NGridOptions?.MinRows ?? 'Min Rows',
        placeholder: I18NGridOptions?.MinRowsDefault ?? 'Default 10',
        type: 'number',
        min: 1,
        max: 100,
        thumbLabel: true,
        autoScale: true }
    },
    {
      className,
      type: 'select-inline',
      key: 'displayGrid',
      props: {
        label: I18NGridOptions?.DisplayGrid ?? 'Display Grid',
        placeholder: 'displayGrid',
        options: [
          { value: 'none', label: I18NGridOptions?.None ?? 'None' },
          { value: 'always', label: I18NGridOptions?.DisplayGrid_Always ?? 'Always' },
          { value: 'onDrag&Resize', label: I18NGridOptions?.DisplayGrid_OnDrag ?? 'On Drag & Resize' }
        ]
      }
    },
    {
      className,
      type: 'select-inline',
      key: 'compactType',
      props: {
        label: I18NGridOptions?.CompactType ?? 'Compact Type',
        placeholder: 'compactType',
        options: [
          { value: 'none', label: I18NGridOptions?.None ?? 'None' },
          { value: 'compactUp', label: 'Compact Up' },
          { value: 'compactLeft', label: 'Compact Left' },
          { value: 'compactUp&Left', label: 'Compact Up & Left' },
          { value: 'compactLeft&Up', label: 'Compact Left & Up' },
          { value: 'compactRight', label: 'Compact Right' },
          { value: 'compactUp&Right', label: 'Compact Up & Right' },
          { value: 'compactRight&Up', label: 'Compact Right & Up' }
        ]
      }
    },
    {
      className,
      key: 'margin',
      type: 'slider',
      props: {
        label: I18NGridOptions?.Margin ?? 'Margin',
        placeholder: 'margin',
        type: 'number',
        min: 1,
        max: 100,
        thumbLabel: true,
        autoScale: true }
    },
    {
      className,
      key: 'outerMargin',
      type: 'checkbox',
      props: {
        label: I18NGridOptions?.OuterMargin ?? 'Outer Margin'
      }
    },
    {
      className,
      type: 'checkbox',
      key: 'swapWhileDragging',
      props: {
        label: I18NGridOptions?.SwapWhileDragging ?? 'Swap While Dragging'
      }
    },
    {
      className,
      key: 'disablePushOnDrag',
      type: 'checkbox',
      props: {
        label: I18NGridOptions?.DisablePushOnDrag ?? 'Disable Push on Drag',
        appearance: 'standard'
      }
    },
    {
      className,
      key: 'scrollToNewItems',
      type: 'checkbox',
      props: {
        label: I18NGridOptions?.ScrollToNewItems ?? 'Scroll To New Items'
      }
    },
    {
      className,
      key: 'allowMultiLayer',
      type: 'checkbox',
      props: {
        label: I18NGridOptions?.AllowMultiLayer ?? 'Allow MultiLayer'
      }
    },
    {
      className,
      hideExpression: `!model || !model.allowMultiLayer`,
      key: 'defaultLayerIndex',
      type: 'slider',
      props: {
        label: I18NGridOptions?.DefaultLayerIndex ?? 'Default Layer Index',
        placeholder: 'defaultLayerIndex',
        type: 'number',
        thumbLabel: true }
    },
    {
      className,
      hideExpression: `!model || !model.allowMultiLayer`,
      key: 'maxLayerIndex',
      type: 'slider',
      props: {
        label: I18NGridOptions?.MaxLayerIndex ?? 'Max Layer Index',
        placeholder: 'maxLayerIndex',
        type: 'number',
        thumbLabel: true }
    },
    {
      className,
      hideExpression: `!model || !model.allowMultiLayer`,
      key: 'baseLayerIndex',
      type: 'slider',
      props: {
        label: I18NGridOptions?.BaseLayerIndex ?? 'Base Layer Index',
        placeholder: 'baseLayerIndex',
        type: 'number',
        thumbLabel: true }
    },

    // {
    //   className,
    //   type: 'input',
    //   key: 'scale',
    //   props: {
    //     label: I18NGridOptions?.Scale ?? 'Scale',
    //     type: 'number'
    //   }
    // }
  ]
}
