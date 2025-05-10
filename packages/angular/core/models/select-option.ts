import { TI18N } from "./i18n"

export interface ISelectOption<T = unknown> {
  key?: string
  /**
   * @deprecated use key
   * 
   * The value object of the option
   */
  value?: T
  /**
   * @deprecated use caption
   */
  label?: string
  caption?: string
  selected?: boolean
  icon?: string
  fontSet?: string
}

/**
 * 树状结构的选择模式
 */
export enum TreeSelectionMode {
  Individual = 'Individual', // 每个节点独立选择
  ParentOnly = 'ParentOnly', // 只输出 Parent
  LeafOnly = 'LeafOnly', // 只输出 Leaf
  ParentChild = 'ParentChild' // 输出所有选中的 Parent 和 Children
}

/**
 * New select option type
 */
export type TSelectOption<T = string | number | boolean, K = string> = {
  key?: K
  value: T

  label?: TI18N | string
  icon?: string
  description?: TI18N | string
}
