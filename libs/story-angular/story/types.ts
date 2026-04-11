import { WidgetComponentType } from '@xpert-ai/story/core'

export const WIDGET_INIT_POSITION = { rows: 10, cols: 20 }

export const WIDGET_DEFAULT_SIZE = {
  width: 500,
  height: 400
}
export const WIDGET_DEFAULT_SIZES = {
  [WidgetComponentType.AnalyticalCard]: { width: 500, height: 400 },
  [WidgetComponentType.AnalyticalGrid]: { width: 500, height: 400 },
  [WidgetComponentType.InputControl]: { width: 240, height: 300 },
  [WidgetComponentType.KpiCard]: { width: 200, height: 200 }
}
