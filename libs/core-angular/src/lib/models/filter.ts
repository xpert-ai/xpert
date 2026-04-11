import { EventEmitter } from '@angular/core'
import { IFilter, ISlicer } from '@xpert-ai/ocap-core'
import { IBaseEventArgs } from './state'

export interface IFilterChangedEventArgs extends IBaseEventArgs {
  name: string
  filter?: IFilter
}

/**
 * 抽象 Filter 组件接口， 实现包括普通 Filter 组件和广义 Filter 组件如
 * {@link NxAnalyticalCardComponent}, {@link NxSmartChartsComponent}, {@link NxSmartFilterComponent}, {@link NxAbstractFilterDirective}
 */
export interface IFilterChange {
  /**
   * Output filter change event
   */
  filterChange?: EventEmitter<IFilter[]>
}

// export function convertSelectMemberToSlicer(options: SelectedMemberOptions): ISlicer {
//   if (!options?.propertyName) {
//     return null
//   }

//   return {
//     dimension: options.propertyName,
//     members: options.selectedMembers,
//     exclude: options.excludeSelected
//   }
// }
