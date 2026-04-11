import { DataSettings, Dimension, ISlicer, RecursiveHierarchyType, TimeGranularity } from '@xpert-ai/ocap-core'
import { TypeAhead } from './control-type'
import { SmartEntityDataOptions } from './smart-entity'

/**
 * @deprecated use {@link FilterSelectionType}
 */
export enum InputControlSelectionType {
  Multiple = 'Multiple',
  Single = 'Single'
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

export interface PropertyOptions {
  propertyName?: Dimension
}

export type PropertyFilterOptions = Partial<{
  dataSettings: DataSettings
  allowViewerModify: boolean
  allowViewersDelete: boolean
  selctionType: InputControlSelectionType
  selectionMode: TreeSelectionMode
}> &
  PropertyOptions

export enum PresentationEnum {
  Flat,
  Hierarchy
}

/**
 * @deprecated
 */
export interface PropertyValueHelpOptions extends PropertyFilterOptions {
  // displayBehaviour?: DisplayBehaviour
  presentation?: PresentationEnum
  showUnbooked?: boolean
  showOnlyLeaves?: boolean
  hideInControls?: boolean
  // selectedMemberOptions: SelectedMemberOptions
  slicer: ISlicer
}

export interface SmartFilterDataOptions<T> extends SmartEntityDataOptions<T>, PropertyOptions {
  typeAhead: TypeAhead
  // the data source of value list members
  // valueListSource: ValueListSource
  // for members
  recursiveHierarchy: RecursiveHierarchyType
  // 是否支持级联过滤
  cascadingEffect: boolean
  // 是否显示 All 成员
  showAllMember: boolean
}

export interface FilterOptions {
  label?: string
  placeholder?: string
  presentation?: PresentationEnum
  selctionType: InputControlSelectionType
  searchable: boolean
}

export interface SmartFilterBarDataOptions extends SmartEntityDataOptions<unknown> {
  dataSettings: DataSettings
  filters: Array<Partial<SmartFilterDataOptions<unknown>>>
  today: {
    enable: boolean
    granularity: TimeGranularity
  }
}
