import { InjectionToken } from '@angular/core'
import { OffSetDirection, TimeGranularity, TimeRange, TimeRangeType } from '@metad/ocap-core'
import {
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subYears
} from 'date-fns'

export interface DateVariable {
  id: string
  name: string
  deps: Array<string>
  useFactory: (deps: any) => any
  dateRange?: TimeRange
}

export const NGM_DATE_VARIABLES = new InjectionToken<DateVariable[]>('Date Variables', {
  providedIn: 'root',
  factory: NX_DATE_VARIABLES_FACTORY
})

export enum DateVariableEnum {
  SYSTEMTIME = 'SYSTEMTIME',
  TODAY = 'TODAY',
  YESTERDAY = 'YESTERDAY',
  DBY = 'DBY',
  DAYS_7_AGO = 'DAYS_7_AGO',
  DAYS_8_AGO = 'DAYS_8_AGO',
  DAYS_14_AGO = 'DAYS_14_AGO',
  DAYS_15_AGO = 'DAYS_15_AGO',
  DAYS_30_AGO = 'DAYS_30_AGO',
  DAYS_31_AGO = 'DAYS_31_AGO',
  RECENT_7_DAYS = 'RECENT_7_DAYS',
  RECENT_14_DAYS = 'RECENT_14_DAYS',
  RECENT_30_DAYS = 'RECENT_30_DAYS',
  RECENT_90_DAYS = 'RECENT_90_DAYS',
  RECENT_180_DAYS = 'RECENT_180_DAYS',
  THIS_WEEK = 'THIS_WEEK',
  THIS_MONTH = 'THIS_MONTH',
  PREVIOUS_MONTH = 'PREVIOUS_MONTH',
  THIS_QUARTER = 'THIS_QUARTER',
  THIS_WHOLE_WEEK = 'THIS_WHOLE_WEEK',
  THIS_WHOLE_MONTH = 'THIS_WHOLE_MONTH',
  THIS_WHOLE_QUARTER = 'THIS_WHOLE_QUARTER',
  THIS_WHOLE_YEAR = 'THIS_WHOLE_YEAR',
  YEAR_TO_TODAY = 'YEAR_TO_TODAY',
  YEAR_TO_YESTERDAY = 'YEAR_TO_YESTERDAY',
  PREVIOUS_YEAR = 'PREVIOUS_YEAR'
}

// System predefined time variables
export function NX_DATE_VARIABLES_FACTORY() {
  return [
    {
      id: DateVariableEnum.SYSTEMTIME,
      name: '系统时间',
      deps: [],
      useFactory: () => {
        return new Date()
      }
    },
    {
      id: DateVariableEnum.TODAY,
      name: '当前日期',
      deps: ['SYSTEMTIME'],
      useFactory: ([systemTime]) => {
        return systemTime
      },
      dateRange: {
        type: TimeRangeType.Standard,
        granularity: TimeGranularity.Day,
        lookBack: 0,
        lookAhead: 0
      }
    },
    {
      id: DateVariableEnum.YESTERDAY,
      name: '昨天',
      deps: ['TODAY'],
      useFactory: ([today]) => {
        return subDays(today, 1)
      },
      dateRange: {
        type: TimeRangeType.Offset,
        granularity: TimeGranularity.Day,
        lookBack: 0,
        lookAhead: 0,
        current: {
          direction: OffSetDirection.LookBack,
          granularity: TimeGranularity.Day,
          amount: 1
        }
      }
    },
    {
      id: DateVariableEnum.DBY,
      name: '前天',
      deps: ['TODAY'],
      useFactory: ([today]) => {
        return subDays(today, 2)
      },
      dateRange: {
        type: TimeRangeType.Offset,
        granularity: TimeGranularity.Day,
        lookBack: 0,
        lookAhead: 0,
        current: {
          direction: OffSetDirection.LookBack,
          granularity: TimeGranularity.Day,
          amount: 2
        }
      }
    },
    {
      id: DateVariableEnum.DAYS_7_AGO,
      name: '七天前',
      deps: ['TODAY'],
      useFactory: ([today]) => {
        return subDays(today, 7)
      },
      dateRange: {
        type: TimeRangeType.Offset,
        granularity: TimeGranularity.Day,
        lookBack: 0,
        lookAhead: 0,
        current: {
          direction: OffSetDirection.LookBack,
          granularity: TimeGranularity.Day,
          amount: 7
        }
      }
    },
    {
      id: DateVariableEnum.DAYS_8_AGO,
      name: '八天前',
      deps: ['TODAY'],
      useFactory: ([today]) => {
        return subDays(today, 8)
      },
      dateRange: {
        type: TimeRangeType.Offset,
        granularity: TimeGranularity.Day,
        lookBack: 0,
        lookAhead: 0,
        current: {
          direction: OffSetDirection.LookBack,
          granularity: TimeGranularity.Day,
          amount: 8
        }
      }
    },
    {
      id: DateVariableEnum.DAYS_14_AGO,
      name: '十四天前',
      deps: ['TODAY'],
      useFactory: ([today]) => {
        return subDays(today, 14)
      },
      dateRange: {
        type: TimeRangeType.Offset,
        granularity: TimeGranularity.Day,
        lookBack: 0,
        lookAhead: 0,
        current: {
          direction: OffSetDirection.LookBack,
          granularity: TimeGranularity.Day,
          amount: 14
        }
      }
    },
    {
      id: DateVariableEnum.DAYS_15_AGO,
      name: '十五天前',
      deps: ['TODAY'],
      useFactory: ([today]) => {
        return subDays(today, 15)
      },
      dateRange: {
        type: TimeRangeType.Offset,
        granularity: TimeGranularity.Day,
        lookBack: 0,
        lookAhead: 0,
        current: {
          direction: OffSetDirection.LookBack,
          granularity: TimeGranularity.Day,
          amount: 15
        }
      }
    },
    {
      id: DateVariableEnum.DAYS_30_AGO,
      name: '三十天前',
      deps: ['TODAY'],
      useFactory: ([today]) => {
        return subDays(today, 30)
      },
      dateRange: {
        type: TimeRangeType.Offset,
        granularity: TimeGranularity.Day,
        lookBack: 0,
        lookAhead: 0,
        current: {
          direction: OffSetDirection.LookBack,
          granularity: TimeGranularity.Day,
          amount: 30
        }
      }
    },
    {
      id: DateVariableEnum.DAYS_31_AGO,
      name: '三十一天前',
      deps: ['TODAY'],
      useFactory: ([today]) => {
        return subDays(today, 31)
      },
      dateRange: {
        type: TimeRangeType.Offset,
        granularity: TimeGranularity.Day,
        lookBack: 0,
        lookAhead: 0,
        current: {
          direction: OffSetDirection.LookBack,
          granularity: TimeGranularity.Day,
          amount: 31
        }
      }
    },
    {
      id: DateVariableEnum.RECENT_7_DAYS,
      name: '最近七天',
      deps: ['TODAY'],
      useFactory: ([today]) => {
        return [subDays(today, 7), today]
      },
      dateRange: {
        type: TimeRangeType.Standard,
        granularity: TimeGranularity.Day,
        lookBack: 7,
        lookAhead: 0
      }
    },
    {
      id: DateVariableEnum.RECENT_14_DAYS,
      name: '最近十四天',
      deps: ['TODAY'],
      useFactory: ([today]) => {
        return [subDays(today, 14), today]
      },
      dateRange: {
        type: TimeRangeType.Standard,
        granularity: TimeGranularity.Day,
        lookBack: 14,
        lookAhead: 0
      }
    },
    {
      id: DateVariableEnum.RECENT_30_DAYS,
      name: '最近三十天',
      deps: ['TODAY'],
      useFactory: ([today]) => {
        return [subDays(today, 30), today]
      },
      dateRange: {
        type: TimeRangeType.Standard,
        granularity: TimeGranularity.Day,
        lookBack: 30,
        lookAhead: 0
      }
    },
    {
      id: DateVariableEnum.RECENT_90_DAYS,
      name: '最近九十天',
      deps: ['TODAY'],
      useFactory: ([today]) => {
        return [subDays(today, 90), today]
      },
      dateRange: {
        type: TimeRangeType.Standard,
        granularity: TimeGranularity.Day,
        lookBack: 90,
        lookAhead: 0
      }
    },
    {
      id: DateVariableEnum.RECENT_180_DAYS,
      name: '最近一百八十天',
      deps: ['TODAY'],
      useFactory: ([today]) => {
        return [subDays(today, 180), today]
      },
      dateRange: {
        type: TimeRangeType.Standard,
        granularity: TimeGranularity.Day,
        lookBack: 180,
        lookAhead: 0
      }
    },
    {
      id: DateVariableEnum.THIS_WEEK,
      name: '本周',
      deps: ['TODAY'],
      useFactory: ([today]) => {
        return [startOfWeek(today, { weekStartsOn: 1 }), today]
      }
    },
    {
      id: DateVariableEnum.THIS_MONTH,
      name: '本月',
      deps: ['TODAY'],
      useFactory: ([today]) => {
        return [startOfMonth(today), today]
      },
      dateRange: {
        type: TimeRangeType.Standard,
        granularity: TimeGranularity.Month,
        lookBack: 0,
        lookAhead: 0
      }
    },
    {
      id: DateVariableEnum.PREVIOUS_MONTH,
      name: '上月',
      deps: ['TODAY'],
      useFactory: ([today]) => {
        const start = subMonths(today, 1)
        return [start, endOfMonth(start)]
      },
      dateRange: {
        type: TimeRangeType.Offset,
        granularity: TimeGranularity.Month,
        lookBack: 0,
        lookAhead: 0,
        current: {
          direction: OffSetDirection.LookBack,
          granularity: TimeGranularity.Month,
          amount: 1
        }
      }
    },
    {
      id: DateVariableEnum.THIS_QUARTER,
      name: '本季度',
      deps: ['TODAY'],
      useFactory: ([today]) => {
        return [startOfQuarter(today), today]
      },
      dateRange: {
        type: TimeRangeType.Standard,
        granularity: TimeGranularity.Quarter,
        lookBack: 0,
        lookAhead: 0
      }
    },
    {
      id: DateVariableEnum.YEAR_TO_TODAY,
      name: '当前年至当天',
      deps: ['TODAY'],
      useFactory: ([today]) => {
        return [new Date(today.getFullYear(), 0, 1), today]
      }
    },
    {
      id: DateVariableEnum.YEAR_TO_YESTERDAY,
      name: '当前年至昨天',
      deps: ['TODAY'],
      useFactory: ([today]) => {
        return [new Date(today.getFullYear(), 0, 1), subDays(today, 1)]
      }
    },
    {
      id: DateVariableEnum.THIS_WHOLE_WEEK,
      name: '本周(包含整周)',
      deps: ['TODAY'],
      useFactory: ([today]) => {
        return [startOfWeek(today, { weekStartsOn: 1 }), endOfWeek(today, { weekStartsOn: 1 })]
      }
    },
    {
      id: DateVariableEnum.THIS_WHOLE_MONTH,
      name: '本月(包含整月)',
      deps: ['TODAY'],
      useFactory: ([today]) => {
        return [startOfMonth(today), endOfMonth(today)]
      }
    },
    {
      id: DateVariableEnum.THIS_WHOLE_QUARTER,
      name: '本季度(包含整季度)',
      deps: ['TODAY'],
      useFactory: ([today]) => {
        return [startOfQuarter(today), endOfQuarter(today)]
      }
    },
    {
      id: DateVariableEnum.THIS_WHOLE_YEAR,
      name: '今年(包含整年)',
      deps: ['TODAY'],
      useFactory: ([today]) => {
        return [startOfYear(today), endOfYear(today)]
      }
    },
    {
      id: DateVariableEnum.PREVIOUS_YEAR,
      name: '去年',
      deps: ['TODAY'],
      useFactory: ([today]) => {
        const lastYear = subYears(today, 1)
        return [startOfYear(lastYear), endOfYear(lastYear)]
      },
      dateRange: {
        type: TimeRangeType.Offset,
        granularity: TimeGranularity.Year,
        lookBack: 0,
        lookAhead: 0,
        current: {
          direction: OffSetDirection.LookBack,
          amount: 1
        }
      }
    }
  ] as Array<DateVariable>
}
