import {
  AggregationRole,
  CalculatedProperty,
  CalculationType,
  Property,
  PropertyHierarchy,
  PropertyMeasure,
  Semantics,
  getHierarchySemanticLevel,
  getTimeYearLevel,
  measureFormatter
} from '@metad/ocap-core'
import { Aggregate, CoalesceEmpty, CurrentMember, ParallelPeriod, Periodstodate, PrevMember, Tuple } from './common'

export function CURRENT(name: string, property: PropertyMeasure) {
  return property as CalculatedProperty
}

function convertXTD(name: string, mProperty: Property, time: string, level: string): string {
  const measure = measureFormatter(name)
  let formula = ''
  if ((mProperty as CalculatedProperty).calculationType === CalculationType.Calculated) {
    // TODO 先将就着用
    const current = (mProperty as CalculatedProperty).formula
    const splitNumber = current.split(' * ')
    const [numerator, denominator] = splitNumber[0].split(' / ')

    // 证明有需要拆分的公式
    if (denominator) {
      const numeratorAccumulative = Aggregate(Periodstodate(numerator, level, CurrentMember(time)))
      const denominatorAccumulative = Aggregate(Periodstodate(denominator, level, CurrentMember(time)))

      formula = `${numeratorAccumulative} / ${denominatorAccumulative}`

      if (splitNumber[1]) {
        formula = `${formula} * ${splitNumber[1]}`
      }
    } else {
      formula = Aggregate(Periodstodate(numerator, level, CurrentMember(time)))
      if (splitNumber[1]) {
        formula = `${formula} * ${splitNumber[1]}`
      }
    }
  }

  if (!formula) {
    formula = Aggregate(Periodstodate(measure, level, CurrentMember(time)))
  }

  return formula
}

/**
 * 组合出 `YTD` `年累计` 公式字段
 *
 * @param name
 * @param entityType
 */
export function YTD(name: string, property: PropertyMeasure, calendar: PropertyHierarchy) {
  const year = getTimeYearLevel(calendar)
  if (!year) {
    throw new Error(`Can't find year level in calendar "${calendar.name}"`)
  }

  const formula = convertXTD(name, property, calendar.name, year.name)

  return {
    name: `${name}-YTD`,
    dataType: 'number',
    role: AggregationRole.measure,
    formula,
    calculationType: CalculationType.Calculated
  }
}

export function QTD(name: string, property: PropertyMeasure, calendar: PropertyHierarchy) {
  const level = getHierarchySemanticLevel(calendar, Semantics['Calendar.Quarter'])

  const formula = convertXTD(name, property, calendar.name, level.name)

  return {
    name: `${name}-QTD`,
    dataType: 'number',
    role: AggregationRole.measure,
    formula,
    calculationType: CalculationType.Calculated
  }
}

export function WTD(name: string, property: PropertyMeasure, calendar: PropertyHierarchy) {
  const level = getHierarchySemanticLevel(calendar, Semantics['Calendar.Week'])

  const formula = convertXTD(name, property, calendar.name, level.name)

  return {
    name: `${name}-WTD`,
    dataType: 'number',
    role: AggregationRole.measure,
    formula,
    calculationType: CalculationType.Calculated
  }
}

export function MTD(name: string, property: PropertyMeasure, calendar: PropertyHierarchy) {
  const level = getHierarchySemanticLevel(calendar, Semantics['Calendar.Month'])

  const formula = convertXTD(name, property, calendar.name, level.name)

  return {
    name: `${name}-MTD`,
    dataType: 'number',
    role: AggregationRole.measure,
    formula,
    calculationType: CalculationType.Calculated
  }
}

export function PYYTD(name: string, timeHierarchy: PropertyHierarchy) {
  const measure = measureFormatter(name)
  // 计算去年同期
  let pPeriod = null

  const yLevel = getHierarchySemanticLevel(timeHierarchy, Semantics['Calendar.Year'])
  // const qLevel = getHierarchySemanticLevel(timeHierarchy, Semantics["Calendar.Quarter"])
  if (yLevel) {
    pPeriod = ParallelPeriod(yLevel.name, 1, timeHierarchy.name)
  } else {
    throw new Error(`Can't find Year level in Calendar dimension: ${timeHierarchy.name}`)
  }

  if (!pPeriod) {
    throw new Error(`Can't figure out parallel period in hierarchy: ${timeHierarchy.name}`)
  }

  return {
    name: `${name}-PYYTD`,
    dataType: 'number',
    role: AggregationRole.measure,
    formula: Aggregate(Periodstodate(measure, yLevel.name, pPeriod)),
    calculationType: CalculationType.Calculated
  }
}

// 当期环比
export function MOM(name: string, calendar: PropertyHierarchy) {
  const current = measureFormatter(name)
  const lastPeriod = CoalesceEmpty(Tuple(PrevMember(calendar.name), current), current)

  return {
    name: `${name}-MOM`,
    dataType: 'number',
    role: AggregationRole.measure,
    formula: `(${current} - ${lastPeriod}) / ${lastPeriod}`,
    calculationType: CalculationType.Calculated
  }
}

// 当期环比差值
export function MOMGAP(name: string, calendar: PropertyHierarchy) {
  const current = measureFormatter(name)
  const lastPeriod = Tuple(PrevMember(CurrentMember(calendar.name)), current)
  return {
    name: `${name}-MOMGAP`,
    dataType: 'number',
    role: AggregationRole.measure,
    formula: `${current} - ${lastPeriod}`,
    calculationType: CalculationType.Calculated
  }
}

// 当期同比
export function YOY(name: string, calendar: PropertyHierarchy) {
  const current = measureFormatter(name)
  const year = getTimeYearLevel(calendar)

  const lastYearCurrent = CoalesceEmpty(
    Tuple(ParallelPeriod(year.name, 1, CurrentMember(calendar.name)), current),
    current
  )
  return {
    name: `${name}-YOY`,
    dataType: 'number',
    role: AggregationRole.measure,
    formula: `(${current} - ${lastYearCurrent}) / ${lastYearCurrent}`,
    calculationType: CalculationType.Calculated
  }
}

// 年累计环比
export function YTDOM(name: string, property: PropertyMeasure, calendar: PropertyHierarchy) {
  const currentAccumulative = YTD(name, property, calendar)
  const prevPeriod = MPM(currentAccumulative.name, calendar)
  return {
    name: `${name}-YTDOM`,
    dataType: 'number',
    role: AggregationRole.measure,
    formula: `(${currentAccumulative.formula} - ${prevPeriod.formula}) / ${prevPeriod.formula} * 100`,
    calculationType: CalculationType.Calculated
  }
}

// 年累计同比
export function YTDOY(name: string, property: PropertyMeasure, calendar: PropertyHierarchy) {
  const currentAccumulative = YTD(name, property, calendar).formula
  const lastYearAccumulative = PYYTD(name, calendar).formula

  return {
    name: `${name}-YTDOY`,
    dataType: 'number',
    role: AggregationRole.measure,
    formula: `(${currentAccumulative} - ${CoalesceEmpty(lastYearAccumulative, currentAccumulative)}) / ${CoalesceEmpty(
      lastYearAccumulative,
      currentAccumulative
    )}`,
    calculationType: CalculationType.Calculated
  }
}

// 当期同比差值（当期 - 去年同期）
export function YOYGAP(name: string, calendar: PropertyHierarchy) {
  const current = measureFormatter(name)
  const year = getTimeYearLevel(calendar)

  const lastYearCurrent = `(${ParallelPeriod(year.name, 1, calendar.name)}, ${current})`
  return {
    name: `${name}-YOYGAP`,
    dataType: 'number',
    role: AggregationRole.measure,
    formula: `${current} - ${lastYearCurrent}`,
    calculationType: CalculationType.Calculated
  }
}

// 年累计同比差值
export function YTDOYGAP(name: string, property: PropertyMeasure, calendar: PropertyHierarchy) {
  const currentAccumulative = YTD(name, property, calendar).formula
  const lastYearAccumulative = PYYTD(name, calendar).formula
  return {
    name: `${name}-YTDOYGAP`,
    dataType: 'number',
    role: AggregationRole.measure,
    formula: `${currentAccumulative} - ${lastYearAccumulative}`,
    calculationType: CalculationType.Calculated
  }
}

// 去年同期
export function PYSM(name: string, calendar: PropertyHierarchy) {
  const current = measureFormatter(name)
  const year = getTimeYearLevel(calendar)

  const lastYearCurrent = `(${ParallelPeriod(year.name, 1, calendar.name)}, ${current})`
  return {
    name: `${name}-PYSM`,
    dataType: 'number',
    role: AggregationRole.measure,
    formula: lastYearCurrent,
    calculationType: CalculationType.Calculated
  }
}

// 去年同期同比
export function PYSMYOY(name: string, calendar: PropertyHierarchy) {
  const year = getTimeYearLevel(calendar)
  // 去年同期
  const lastYearCurrent = measureFormatter(PYSM(name, calendar).name)
  // 前年同期
  const lastTwoYearCurrent = `(${ParallelPeriod(year.name, 1, calendar.name)}, ${lastYearCurrent})`
  return {
    name: `${name}-PYSMYOY`,
    dataType: 'number',
    role: AggregationRole.measure,
    formula: `(${lastYearCurrent} - ${lastTwoYearCurrent}) / ${lastTwoYearCurrent} * 100`,
    calculationType: CalculationType.Calculated
  }
}

// 上期
export function MPM(name: string, calendar: PropertyHierarchy) {
  const current = measureFormatter(name)
  return {
    name: `${name}-MPM`,
    dataType: 'number',
    role: AggregationRole.measure,
    formula: Tuple(PrevMember(CurrentMember(calendar.name)), current),
    calculationType: CalculationType.Calculated
  }
}

// 上期同比
export function MPMYOY(name: string, calendar: PropertyHierarchy) {
  const year = getTimeYearLevel(calendar)
  // 上期
  const lastPeriod = measureFormatter(MPM(name, calendar).name)
  // 去年上期
  const lastYearLastPeriod = `(${ParallelPeriod(year.name, 1, CurrentMember(calendar.name))}, ${lastPeriod})`
  return {
    name: `${name}-MPMYOY`,
    dataType: 'number',
    role: AggregationRole.measure,
    formula: `(${lastPeriod} - ${lastYearLastPeriod}) / ${lastYearLastPeriod} * 100`,
    calculationType: CalculationType.Calculated
  }
}
