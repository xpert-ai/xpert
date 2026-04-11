import { Dimension, ISlicer, OrderDirection } from '@xpert-ai/ocap-core'
import { WidgetMenu } from '@xpert-ai/core'

export interface DrillLevel {
  // 父级维度， 从哪个维度下钻来的
  parent: Dimension
  property?: Dimension
  level?: number
  slicer: ISlicer
  value?: any
  text?: string
  active?: boolean
}

export interface WidgetOrderMenu extends WidgetMenu {
  order: OrderDirection
}
