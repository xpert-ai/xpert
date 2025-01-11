import { addDays, startOfMonth, startOfQuarter, startOfYear, subDays, subSeconds } from 'date-fns'

export enum TimeRangeEnum {
  Today = 'Today',
  Last7Days = 'Last7Days',
  Last4Weeks = 'Last4Weeks',
  Last3Months = 'Last3Months',
  MonthToDate = 'MonthToDate',
  QuarterToDate = 'QuarterToDate',
  YearToDate = 'YearToDate',
  All = 'All'
}

export const TimeRangeOptions = [
  {
    value: TimeRangeEnum.Today,
    label: {
      en_US: 'Today',
      zh_Hans: '今天'
    }
  },
  {
    value: TimeRangeEnum.Last7Days,
    label: {
      en_US: 'Last 7 days',
      zh_Hans: '最近7天'
    }
  },
  {
    value: TimeRangeEnum.Last4Weeks,
    label: {
      en_US: 'Last 4 weeks',
      zh_Hans: '最近4周'
    }
  },
  {
    value: TimeRangeEnum.Last3Months,
    label: {
      en_US: 'Last 3 months',
      zh_Hans: '最近3个月'
    }
  },
  {
    value: TimeRangeEnum.MonthToDate,
    label: {
      en_US: 'Month to date',
      zh_Hans: '本月至今'
    }
  },
  {
    value: TimeRangeEnum.QuarterToDate,
    label: {
      en_US: 'Quarter to date',
      zh_Hans: '本季度至今'
    }
  },
  {
    value: TimeRangeEnum.YearToDate,
    label: {
      en_US: 'Year to date',
      zh_Hans: '本年至今'
    }
  },
  {
    value: TimeRangeEnum.All,
    label: {
      en_US: 'All time',
      zh_Hans: '所有时间'
    }
  }
]

export function calcTimeRange(value: TimeRangeEnum) {
  const today = new Date()
  let start = today
  switch (value) {
    case 'Today': {
      break
    }
    case 'Last7Days': {
      start = subDays(new Date(), 6)
      break
    }
    case 'Last4Weeks': {
      start = subDays(new Date(), 27)
      break
    }
    case 'Last3Months': {
      start = subDays(new Date(), 90)
      break
    }
    case 'MonthToDate': {
      start = startOfMonth(today)
      break
    }
    case 'QuarterToDate': {
      start = startOfQuarter(today)
      break
    }
    case 'YearToDate': {
      start = startOfYear(today)
      break
    }
    case 'All': {
      start = null
      break
    }
  }

  return [
    start?.toISOString().slice(0, 10),
    subSeconds(addDays(new Date(today.toISOString().slice(0, 10)), 1), 1).toISOString()
  ]
}
