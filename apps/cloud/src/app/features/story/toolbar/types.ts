
import { StoryPoint, StoryPointType, WidgetComponentType } from '@xpert-ai/story/core'
import { DisplayGrid } from 'angular-gridster2'

export const COMPONENTS: {
  code: string
  label: string
  icon: string
  value: {
    component: string
  }
}[] = [
  {
    code: 'FILTER_BAR',
    label: 'Filter Bar',
    icon: 'filter_alt',
    value: {
      component: WidgetComponentType.FilterBar
    }
  },
  {
    code: 'Today',
    label: 'Today',
    icon: 'today',
    value: {
      component: WidgetComponentType.Today
    }
  },
  {
    code: 'Image',
    label: 'Image',
    icon: 'image',
    value: {
      component: WidgetComponentType.Image
    }
  },
  {
    code: 'Text',
    label: 'Text',
    icon: 'format_color_text',
    value: {
      component: WidgetComponentType.Text
    }
  },
  {
    code: 'Document',
    label: 'Document',
    icon: 'post_add',
    value: {
      component: WidgetComponentType.Document
    }
  },
  {
    code: 'Iframe',
    label: 'Iframe',
    icon: 'filter_frames',
    value: {
      component: WidgetComponentType.Iframe
    }
  },
  {
    code: 'Video',
    label: 'Video',
    icon: 'ondemand_video',
    value: {
      component: WidgetComponentType.Video
    }
  }
]

export const PAGES: {
  value: Partial<StoryPoint>
  label: string
  icon?: string
}[] = [
  {
    value: {
      type: StoryPointType.Canvas
    },
    label: 'Default Canvas',
    icon: 'canvas.svg'
  },
  {
    value: {
      type: StoryPointType.Canvas,
      gridOptions: {
        gridType: 'fit',
        setGridSize: false,
        displayGrid: DisplayGrid.OnDragAndResize,
        fixedColWidth: 10,
        fixedRowHeight: 10,
        rowHeightRatio: 1,
        minCols: 100,
        minRows: 70,
        maxCols: 100,
        maxRows: 70,
        allowMultiLayer: true
      }
    },
    label: 'Fit Screen (Dense)'
  },
  {
    value: {
      type: StoryPointType.Canvas,
      gridOptions: {
        gridType: 'fit',
        setGridSize: false,
        displayGrid: DisplayGrid.OnDragAndResize,
        fixedColWidth: 10,
        fixedRowHeight: 10,
        rowHeightRatio: 1,
        minCols: 30,
        minRows: 20,
        maxCols: 30,
        maxRows: 20,
        allowMultiLayer: true
      }
    },
    label: 'Fit Screen (Cosy)'
  },
  {
    value: {
      type: StoryPointType.Canvas,
      gridOptions: {
        gridType: 'fit',
        setGridSize: false,
        displayGrid: DisplayGrid.OnDragAndResize,
        fixedColWidth: 10,
        fixedRowHeight: 10,
        rowHeightRatio: 1,
        minCols: 15,
        minRows: 10,
        maxCols: 15,
        maxRows: 10,
        allowMultiLayer: true
      }
    },
    label: 'Fit Screen (Comfort)'
  },
  {
    value: {
      type: StoryPointType.Canvas,
      gridOptions: {
        gridType: 'fixed',
        setGridSize: true,
        displayGrid: DisplayGrid.OnDragAndResize,
        fixedColWidth: 10,
        fixedRowHeight: 10,
        rowHeightRatio: 1,
        minCols: 75,
        minRows: 46,
        maxCols: 75,
        maxRows: 46,
        outerMarginTop: 10,
        outerMarginRight: 10,
        outerMarginBottom: 10,
        outerMarginLeft: 10,
        allowMultiLayer: true
      }
    },
    label: 'Fixed Dense (MacBook Pro 14)'
  },
  {
    value: {
      type: StoryPointType.Canvas,
      gridOptions: {
        gridType: 'fixed',
        setGridSize: true,
        displayGrid: DisplayGrid.OnDragAndResize,
        fixedColWidth: 30,
        fixedRowHeight: 30,
        rowHeightRatio: 1,
        minCols: 37,
        minRows: 23,
        maxCols: 37,
        maxRows: 23,
        outerMarginTop: 10,
        outerMarginRight: 10,
        outerMarginBottom: 10,
        outerMarginLeft: 10,
        allowMultiLayer: true
      }
    },
    label: 'Fixed Cosy (MacBook Pro 14)'
  },
  {
    value: {
      type: StoryPointType.Canvas,
      gridOptions: {
        gridType: 'fixed',
        setGridSize: true,
        displayGrid: DisplayGrid.OnDragAndResize,
        fixedColWidth: 100,
        fixedRowHeight: 100,
        rowHeightRatio: 1,
        minCols: 13,
        minRows: 8,
        maxCols: 13,
        maxRows: 8,
        outerMarginTop: 10,
        outerMarginRight: 10,
        outerMarginBottom: 10,
        outerMarginLeft: 10,
        allowMultiLayer: true
      }
    },
    label: 'Fixed Comfort (MacBook Pro 14)'
  },
  {
    value: {
      type: StoryPointType.Canvas,
      gridOptions: {
        gridType: 'verticalFixed',
        setGridSize: false,
        displayGrid: DisplayGrid.OnDragAndResize,
        fixedColWidth: 20,
        fixedRowHeight: 20,
        rowHeightRatio: 1,
        minCols: 13,
        maxCols: 13,
        outerMarginTop: 10,
        outerMarginRight: 10,
        outerMarginBottom: 10,
        outerMarginLeft: 10,
        allowMultiLayer: false
      }
    },
    label: 'Vertical Fixed (Phone)'
  }
]
