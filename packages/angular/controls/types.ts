import { FilterSelectionType, IMember, SmartFilterDataOptions, TreeSelectionMode } from '@xpert-ai/ocap-core'

export interface ControlOptions extends SmartFilterDataOptions {
  label?: string
  placeholder?: string
  selectionType?: FilterSelectionType
  multiple?: boolean
  searchable?: boolean
  /**
   * Default selected members
   */
  defaultMembers?: IMember[]
  /**
   * Auto active the first select option
   */
  autoActiveFirst?: boolean
}

export interface TreeControlOptions extends ControlOptions {
  /**
   * Initial expand level for tree structure
   */
  initialLevel?: number

  /**
   * Selection mode for tree structure
   */
  treeSelectionMode?: TreeSelectionMode

  /**
   * Display only leaf nodes 
   */
  onlyLeaves?: boolean
}
