import {
  addDays,
  addMonths,
  addQuarters,
  addWeeks,
  addYears,
  format,
  parse,
  subDays,
  subMonths,
  subQuarters,
  subWeeks,
  subYears
} from 'date-fns'
import { Semantics } from '../annotations'
import { FilterOperator, getPropertyHierarchy, ISlicer } from '../types'
import { isNil } from '../utils'
import {
  getDefaultHierarchy,
  getEntityCalendarHierarchy,
  getEntityDimensions,
  getEntityHierarchy,
  getEntityProperty
} from './helper'
import { EntityType, Property, PropertyDimension, PropertyHierarchy, PropertyLevel } from './sdl'
import { t } from 'i18next'

export enum TimeGranularity {
  Year = 'Year',
  Quarter = 'Quarter',
  Month = 'Month',
  Week = 'Week',
  Day = 'Day'
  // @todo more
}

export enum TimeRangeType {
  Standard = 'Standard',
  Offset = 'Offset'
}

export enum OffSetDirection {
  LookBack = 'LookBack',
  LookAhead = 'LookAhead'
}

export interface TimeOffSet {
  current?: Date
  direction: OffSetDirection
  granularity: TimeGranularity
  amount: number
}

export interface TimeRange {
  type: TimeRangeType
  granularity: TimeGranularity
  current?: Exclude<TimeOffSet, 'granularity'>
  lookBack?: number
  lookAhead?: number
  /**
   * Start period
   * yyyy, yyyyMM, yyyyMMdd, yyyy'Q'Q, yyyy'W'W
   */
  start?: string
  /**
   * End period
   */
  end?: string
  selected?: boolean
  /**
   * Format string for time value
   */
  formatter?: string
}

export interface TimeRangesSlicer extends ISlicer {
  currentDate: 'TODAY' | 'SYSTEMTIME'
  ranges: Array<TimeRange>
}

// type Guards
export const isTimeRangesSlicer = (toBe): toBe is TimeRangesSlicer =>
  !isNil((toBe as TimeRangesSlicer)?.ranges) && !isNil((toBe as TimeRangesSlicer)?.currentDate)

// Helpers

export function mapTimeGranularitySemantic(granularity: TimeGranularity): Semantics {
  switch (granularity) {
    case TimeGranularity.Year:
      return Semantics['Calendar.Year']
    case TimeGranularity.Quarter:
      return Semantics['Calendar.Quarter']
    case TimeGranularity.Month:
      return Semantics['Calendar.Month']
    case TimeGranularity.Day:
      return Semantics['Calendar.Day']
    default:
      throw new Error(`Can't found semantics for granularity ${granularity}`)
  }
}

export function mapSemanticTimeGranularity(semantic: Semantics): TimeGranularity {
  switch (semantic) {
    case Semantics['Calendar.Year']:
      return TimeGranularity.Year
    case Semantics['Calendar.Quarter']:
      return TimeGranularity.Quarter
    case Semantics['Calendar.Month']:
      return TimeGranularity.Month
    case Semantics['Calendar.Day']:
      return TimeGranularity.Day
    default:
      throw new Error(`Can't found granularity for semantic ${semantic}`)
  }
}

export function formatCurrentPeriod(current: number | Date, granularity: TimeGranularity, formatter?: string) {
  if (granularity === null || current === null) {
    return null
  }
  let _format = 'yyyMMdd'
  switch (granularity) {
    case TimeGranularity.Year:
      _format = 'yyyy'
      break
    case TimeGranularity.Quarter:
      _format = `yyyy'Q'Q`
      break
    case TimeGranularity.Month:
      _format = 'yyyyMM'
      break
    case TimeGranularity.Day:
      _format = 'yyyyMMdd'
      break
  }

  return format(current, formatter || _format)
}

export function reformat(currentDate: Date, dat: string, granularity: TimeGranularity, target: string) {
  switch (granularity) {
    case TimeGranularity.Year:
      return format(parse(dat, 'yyyy', currentDate), target)
    case TimeGranularity.Month:
      return format(parse(dat, 'yyyyMM', currentDate), target)
    case TimeGranularity.Quarter:
      return format(parse(dat, `yyyy'Q'Q`, currentDate), target)
    // Not supported yet
    // case TimeGranularity.Week:
      // return format(parse(dat, `yyyyw`, currentDate), target)
    case TimeGranularity.Day:
      return format(parse(dat, `yyyyMMdd`, currentDate), target)
  }
  return dat
}

/**
 * Calculate relative offset time
 * 
 * @param currentDate 
 * @param param1 direction granularity amount
 * @returns Date
 */
export function calcOffset(currentDate: Date, { direction, granularity, amount }: Partial<TimeOffSet>): Date {
  amount = amount || 0
  switch (granularity) {
    case TimeGranularity.Year:
      if (direction === OffSetDirection.LookBack) {
        return subYears(currentDate, amount)
      } else {
        return addYears(currentDate, amount)
      }
    case TimeGranularity.Quarter:
      if (direction === OffSetDirection.LookBack) {
        return subQuarters(currentDate, amount)
      } else {
        return addQuarters(currentDate, amount)
      }
    case TimeGranularity.Month:
      if (direction === OffSetDirection.LookBack) {
        return subMonths(currentDate, amount)
      } else {
        return addMonths(currentDate, amount)
      }
    case TimeGranularity.Week:
      if (direction === OffSetDirection.LookBack) {
        return subWeeks(currentDate, amount)
      } else {
        return addWeeks(currentDate, amount)
      }
    case TimeGranularity.Day:
      if (direction === OffSetDirection.LookBack) {
        return subDays(currentDate, amount)
      } else {
        return addDays(currentDate, amount)
      }
    default:
      return currentDate
  }
}

export function formatRangeCurrentPeriod(current: Date, range: TimeRange) {
  if (range.type === TimeRangeType.Offset) {
    current = calcOffset(current, { ...range.current, granularity: range.granularity })
  }

  return formatCurrentPeriod(current, range.granularity, range.formatter)
}

export function calcStartEndRange(current: Date, range: TimeRange) {
  return [
    reformat(current, range.start, range.granularity, range.formatter),
    range.end ? reformat(current, range.end, range.granularity, range.formatter) : null,
  ]
}

export function calcOffsetRange(current: Date, range: TimeRange) {
  // 为了支持 AI 不能理解复杂规则， 所以主动适应 AI 的理解
  let from = range.lookBack ?? -range.lookAhead
  let to = range.lookAhead ?? -range.lookBack
  if (range.type === TimeRangeType.Offset) {
    current = calcOffset(current, { ...range.current, granularity: range.granularity })
    from = range.lookBack ?? 1
    to = range.lookAhead ?? -1
  }

  return [
    formatCurrentPeriod(
      calcOffset(current, {
        direction: OffSetDirection.LookBack,
        granularity: range.granularity,
        amount: from
      }),
      range.granularity,
      range.formatter
    ),

    formatCurrentPeriod(
      calcOffset(current, {
        direction: OffSetDirection.LookAhead,
        granularity: range.granularity,
        amount: to
      }),
      range.granularity,
      range.formatter
    )
  ]
}

/**
 * Calculate time range slicer to common slicer base current date
 *
 * @param currentDate
 * @param timeSlicer
 * @param entityType
 * @returns
 */
export function workOutTimeRangeSlicers(
  currentDate: Date,
  timeSlicer: TimeRangesSlicer,
  entityType?: EntityType
): ISlicer[] {
  const property = getEntityCalendarHierarchy(entityType, timeSlicer.dimension)

  return timeSlicer.ranges.map((range) => {
    const calendarSemantic = mapTimeGranularitySemantic(range.granularity)
    const calendarLevel = property?.levels?.find((level) => level.semantics?.semantic === calendarSemantic)
    const targetFormatter = range.formatter || calendarLevel?.semantics?.formatter
    if (!targetFormatter) {
      if (!calendarLevel) {
        throw new Error(t('Error.NoTimeLevelInDimension', {ns: 'core', dimension: getPropertyHierarchy(timeSlicer.dimension), granularity: range.granularity}))
      }
      throw new Error(`Target formatter not set for dimension: ${timeSlicer.dimension?.dimension} and granularity: ${range.granularity}`)
    }
    const results = range.start ? calcStartEndRange(currentDate || new Date(), {
        ...range,
        formatter: targetFormatter
      })
      : calcOffsetRange(currentDate || new Date(), {
        ...range,
        formatter: targetFormatter
      })

    if (!results[1] || results[0] === results[1]) {
      return {
        dimension: timeSlicer.dimension,
        members: [
          {
            key: results[0],
            value: results[0]
          }
        ]
      }
    }

    return {
      dimension: timeSlicer.dimension,
      members: results.map((key) => ({ key, value: key })),
      operator: FilterOperator.BT
    }
  })
}

export function timeRangesSlicerAsString(slicer: TimeRangesSlicer, i18nTimeRanges?: string) {
  return `${i18nTimeRanges ?? 'Time Ranges'}: ${slicer.ranges
    .map(
      (range) =>
        `${range.type}|${range.granularity}${
          range.type === TimeRangeType.Offset
            ? `(${range.current?.direction ?? ''}:${range.current?.amount ?? 0}):[${isNil(range.lookBack) ? 1 : -range.lookBack}, ${isNil(range.lookAhead) ? -1 : range.lookAhead}]`
            : `:[${isNil(range.lookBack) ? (range.lookAhead ?? 0) : -range.lookBack}, ${isNil(range.lookAhead) ? -(range.lookBack ?? 0) : range.lookAhead}]`
        }`
    )
    .join(' & ')}`
}

// for Calendar Functions
export function getCalendarDimension(entityType: EntityType): Property {
  const timeDim = getEntityDimensions(entityType).find(
    (property) => property.semantics?.semantic === Semantics.Calendar
  )
  if (!timeDim) {
    throw new Error(
      t('Error.CalendarDimensionNotFound', {ns: 'core', cube: entityType.name})
    )
  }
  return timeDim
}

export function getCalendarHierarchy(entityType: EntityType): PropertyHierarchy {
  const timeDim = getCalendarDimension(entityType)
  const timeHierarchy = getDefaultHierarchy(timeDim)

  if (!timeHierarchy) {
    throw new Error(
      t('Error.CalendarHierarchyNotFound', {ns: 'core', dimension: timeDim?.name})
    )
  }

  return timeHierarchy
}

/**
 * Get the specified calendar dimension or the default calendar dimension
 *
 * @param entityType
 * @param calendar
 * @param timeGranularity
 * @returns
 */
export function getEntityCalendar(
  entityType: EntityType,
  calendar?: string,
  timeGranularity?: TimeGranularity
): {
  dimension: PropertyDimension
  hierarchy: PropertyHierarchy
  level?: PropertyLevel
} {
  let calendarHierarchy: PropertyHierarchy
  let calendarDimension: PropertyDimension
  if (calendar) {
    calendarHierarchy = getEntityHierarchy(entityType, calendar)
    if (!calendarHierarchy) {
      return null
    }
    calendarDimension = getEntityProperty(entityType, calendarHierarchy.dimension)
  } else {
    // get default calendar dimension in entity type
    calendarDimension = getCalendarDimension(entityType)
    calendarHierarchy = getDefaultHierarchy(calendarDimension)
  }

  if (!calendarDimension) {
    throw new Error(`Can't found default calendar in entityType: '${entityType.name}' or calendar: '${calendar}'`)
  }

  if (timeGranularity) {
    const calendarSemantic = mapTimeGranularitySemantic(timeGranularity)
    const calendarLevel =
      calendarHierarchy.levels?.find((level) => level.semantics?.semantic === calendarSemantic) ??
      calendarHierarchy.levels?.[calendarHierarchy.levels?.length - 1]
    return {
      dimension: calendarDimension,
      hierarchy: calendarHierarchy,
      level: calendarLevel
    }
  }

  return {
    dimension: calendarDimension,
    hierarchy: calendarHierarchy
  }
}

export function getTimeYearLevel(hierarchy: PropertyHierarchy): PropertyLevel {
  const yearLevel = hierarchy?.levels?.find((item) => item.semantics?.semantic === Semantics['Calendar.Year'])

  if (!yearLevel) {
    throw new Error(`Can't found Year level in Calendar dimension: ${hierarchy.name}`)
  }

  return yearLevel
}

export function getTimeQuarterLevel(hierarchy: PropertyHierarchy): PropertyLevel {
  const quarter = hierarchy.levels.find((item) => item.semantics?.semantic === Semantics['Calendar.Quarter'])
  return quarter
}
