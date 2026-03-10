import { SmartFilterOptions } from '@metad/ocap-angular/controls'
import { DisplayDensity, NgmFieldAppearance, NgmFloatLabel } from '@metad/ocap-angular/core'
import { FilterRestrictions } from '@metad/ocap-core'
import { FilterControlType, StoryFilterBarOptions } from '@metad/story/core'

export interface FilterBarSmartFilterOptions extends SmartFilterOptions {
  /**
   * 是否启用此过滤器的级联联动
   */
  cascadingEffect?: boolean
}

export interface FilterBarFieldOptions {
  controlType: FilterControlType
  options: FilterBarSmartFilterOptions
  styling: any
}

export enum CascadingEffect {
  InTurn = 'InTurn',
  All = 'All'
}

/**
 * Describes the object used to configure the SmartFilterBar in Angular DI.
 */
export interface ISmartFilterBarOptions extends StoryFilterBarOptions {

  loadingStatusDebounceTime?: number
  // layout?: {
  //   // TODO: 是否使用自适应方式替代?
  //   direction: 'ROW' | 'ROW-REVERSE' | 'COLUMN' | 'COLUMN-REVERSE'
  // }

  filters?: { [key: string]: FilterBarFieldOptions }
  filterRestrictions?: FilterRestrictions
  appearance?: NgmFieldAppearance
  floatLabel?: NgmFloatLabel
  displayDensity?: DisplayDensity
}
