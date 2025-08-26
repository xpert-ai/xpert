import { Inject, Injectable, InjectionToken, OnDestroy, Optional, inject } from '@angular/core'
import { nonBlank, nonNullable, replaceParameters } from '@metad/core'
import { NgmDSCoreService, NgmSmartFilterBarService } from '@metad/ocap-angular/core'
import {
  CriticalityCalculationType,
  CriticalityType,
  DataPointType,
  Dimension,
  ImprovementDirectionType,
  KPIType,
  Measure,
  PrimitiveType,
  PropertyMeasure,
  QueryOptions,
  SmartBusinessService,
  TrendCalculationType,
  TrendType,
  getEntityProperty,
  getPropertyMeasure,
  getPropertyName,
  getPropertyUnitName,
  isDimension,
  isEmpty,
  isMeasure,
  isNil,
  isString,
  mergeOptions
} from '@metad/ocap-core'
import { NGXLogger } from 'ngx-logger'
import { Observable } from 'rxjs'
import { filter, map, shareReplay, switchMap } from 'rxjs/operators'
import { NxWidgetKPIOptions } from './types'

/**
 * Describes the object used to configure the SmartKPI in Angular DI.
 */
export interface ISmartKPIOptions {
  deviation?: {
    text?: string
    precision?: number
  }
}

/**
 * Defines the SmartKPI DI token.
 */
export const SMART_KPI_TOKEN = new InjectionToken<ISmartKPIOptions>('SmartKPIToken')

export interface SmartKPIValue {
  id?: string
  Title?: string
  value: number
  targetValue?: number
  unit?: string
  unitSemantics?: string
  deviation?: number
  referenceValue?: number
  referenceValueUnit?: string
  referenceValueUnitSemantics?: string
  arrow?: TrendType
  criticality?: CriticalityType
}

/**
 * [Creating Key Performance Indicator Tags](https://sapui5.hana.ondemand.com/#/topic/d80a360638ad4cf193cc55eee92bff2e)
 *
 * [Criticality](https://github.com/SAP/odata-vocabularies/blob/master/vocabularies/UI.md#CriticalityCalculationType)
 *
 * * Criticality
 * `Criticality` 服务端计算
 * `CriticalityCalculation` 客户端计算
 *
 * * Trend
 * `Trend` 服务端计算
 * `TrendCalculation` 客户端计算
 *
 */
@Injectable()
export class KeyPerformanceIndicatorService<T> extends SmartBusinessService<T> implements OnDestroy {
  protected logger? = inject(NGXLogger, { optional: true })

  public options: NxWidgetKPIOptions

  // 设置是否显示为 short number 格式
  public shortNumber: boolean
  public numberTracker: boolean

  private readonly KPIAnnotation$ = this.dataSettings$.pipe(
    filter(nonNullable),
    map((dataSettings) => dataSettings?.KPIAnnotation)
  )

  public dataPoint$: Observable<Partial<DataPointType>> = this.KPIAnnotation$.pipe(
    filter(nonNullable),
    map((annotation) => annotation.DataPoint)
  )

  // 暂时支持一条记录计算 KPI, 未来可能支持多条记录计算 Trend 例如 本期，环比，同比 为三条记录
  private _data$: Observable<any> = this.selectResult().pipe(
    filter(Boolean),
    map(({ data }) => (data && data[0]) || {})
  )

  // 计算后的 KPI Value
  public kpiValue$: Observable<SmartKPIValue> = this._data$.pipe(
    filter(nonNullable),
    switchMap(async (data) => {
      try {
        return this.getKPIAnnotation()
          ? await this.calculateDataPoint(data, this.getKPIAnnotation()?.DataPoint)
          : ({} as SmartKPIValue)
      } catch (error) {
        return null
      }
    }),
    shareReplay(1)
  )

  // 主 value
  public value$: Observable<string> = this.kpiValue$.pipe(map((value) => value.value.toString()))
  public unit$: Observable<string>
  // TargetValue
  public targetValue$: Observable<number>
  // Progress
  public progress$: Observable<string>
  // 引用 value
  public referenceValue$: Observable<string>

  public additionalDataPoints$: Observable<Array<SmartKPIValue>>

  private _defaultOptions = {
    deviation: {
      precision: 2
    }
  }

  constructor(
    dsCoreService: NgmDSCoreService,
    @Optional() filterBarService: NgmSmartFilterBarService,

    @Optional()
    @Inject(SMART_KPI_TOKEN)
    _defaultOptions?: ISmartKPIOptions
  ) {
    super(dsCoreService, filterBarService)

    if (_defaultOptions) {
      this._defaultOptions = mergeOptions(this._defaultOptions, _defaultOptions)
    }

    // 将 value unit 值分开， 未来是否不需要
    this.value$ = this.kpiValue$.pipe(map((value) => value.value.toString()))
    this.unit$ = this.kpiValue$.pipe(map((value) => value.unit))
    this.targetValue$ = this.kpiValue$.pipe(
      map((kpiValue) => kpiValue?.targetValue),
      shareReplay(1)
    )

    this.progress$ = this.kpiValue$.pipe(
      map((values) => {
        // targetValue is not zero
        if (values.targetValue) {
          return ((values.value / values.targetValue) * 100).toFixed(this._defaultOptions.deviation.precision)
        }
        return values.value ? '100' : '0'
      }),
      shareReplay(1)
    )

    this.additionalDataPoints$ = this._data$.pipe(
      filter(() => !!this.getKPIAnnotation()?.AdditionalDataPoints),
      switchMap(async (data) => {
        try {
          const annotation = this.getKPIAnnotation()
          const additionalDataPoints = []
          for (const dataPoint of annotation.AdditionalDataPoints) {
            additionalDataPoints.push(
              await this.calculateDataPoint(data, mergeOptions({ Value: annotation.DataPoint.Value }, dataPoint))
            )
          }
          return additionalDataPoints
        } catch (err) {
          return []
        }
      }),
      shareReplay(1)
    )
  }

  onInit(): Observable<any> {
    return super.onInit().pipe(
      switchMap(() =>
        this.dataSettings$.pipe(
          map((dataSettings) => dataSettings?.KPIAnnotation),
          // The Value field of main kpi is required
          filter(
            (KPIAnnotation) => isString(KPIAnnotation?.DataPoint?.Value) || !!KPIAnnotation?.DataPoint?.Value?.measure
          )
        )
      )
    )
  }

  async calculateDataPoint(row: any, dataPoint: Partial<DataPointType>) {
    const value = row ? _getValue(row, dataPoint?.Value) : null
    let unit = null
    const unitSemantics = null
    const entityType = await this.getEntityType()
    const valueProperty = await getEntityProperty<PropertyMeasure>(entityType, dataPoint.Value)
    const unitName = getPropertyUnitName(valueProperty)
    if (unitName) {
      unit = row?.[unitName]
    } else if (valueProperty?.formatting?.unit) {
      unit = valueProperty.formatting.unit
    }

    const targetValue = row ? _getValue(row, dataPoint.TargetValue) : null

    let kpiValue: SmartKPIValue = {
      Title: replaceParameters(dataPoint.Title || dataPoint.Value.caption || valueProperty.caption, entityType),
      value,
      targetValue,
      unit,
      unitSemantics,
      deviation: targetValue ? ((value - targetValue) / Math.abs(targetValue)) * 100 : null
    }

    this._getPatternPath(dataPoint, 'Title', 'Description', 'LongDescription')
      // tslint:disable-next-line: no-shadowed-variable
      .forEach(({ name, value }) => {
        if (value) {
          kpiValue[name] = row[value]
        }
      })

    if (dataPoint.TrendCalculation) {
      kpiValue = mergeOptions(kpiValue, await this.calculateTrend(row, dataPoint))
    }
    if (dataPoint.CriticalityCalculation) {
      kpiValue.criticality = this.calculateCriticality(value, row, dataPoint.CriticalityCalculation)
    }
    if (dataPoint.ID) {
      kpiValue.id = dataPoint.ID
    }

    return kpiValue
  }

  async calculateTrend(data, annotation: Partial<DataPointType>) {
    const expected = _getValue(data, annotation.TrendCalculation.ReferenceValue)
    const value = strToNumber(_getValue(data, annotation.Value))
    const referenceValue = expected

    let referenceValueUnit = null
    const referenceValueUnitSemantics = null
    if (isString(annotation.TrendCalculation.ReferenceValue)) {
      const referenceValueProperty = await this.getProperty(annotation.TrendCalculation.ReferenceValue)
      const unitName = getPropertyUnitName(referenceValueProperty)
      if (unitName) {
        referenceValueUnit = data[unitName]
        // TODO
        // referenceValueUnitSemantics = isObject(referenceValueProperty.unit.semantic) ? referenceValueProperty.unit.semantic.name : referenceValueProperty.unit.semantic
      }
    }

    let deviation
    if (expected) {
      deviation = ((value - expected) / Math.abs(expected)) * 100
    } else {
      if (value - expected > 0) {
        deviation = 100
      } else if (value - expected < 0) {
        deviation = -100
      } else {
        deviation = 0
      }
    }

    return {
      value,
      referenceValue,
      referenceValueUnit,
      referenceValueUnitSemantics,
      deviation, // 偏差计算
      arrow: this.calculateArrow(value, referenceValue, data, annotation.TrendCalculation)
    }
  }

  calculateArrow(value, expected, data, trendCalculation: Partial<TrendCalculationType>) {
    const upDifference = _getValue(data, trendCalculation.UpDifference)
    const strongUpDifference = _getValue(data, trendCalculation.StrongUpDifference)
    const downDifference = _getValue(data, trendCalculation.DownDifference)
    const strongDownDifference = _getValue(data, trendCalculation.StrongDownDifference)

    let difference
    if (_getValue(data, trendCalculation.IsRelativeDifference)) {
      difference = (value - expected) / Math.abs(expected)
    } else {
      difference = value - expected
    }
    if (!isNil(strongUpDifference) && difference >= strongUpDifference) {
      return TrendType.StrongUp
    }
    if (!isNil(upDifference) && difference >= upDifference) {
      return TrendType.Up
    }
    if (!isNil(strongDownDifference) && difference <= strongDownDifference) {
      return TrendType.StrongDown
    }
    if (!isNil(downDifference) && difference <= downDifference) {
      return TrendType.Down
    }
    return TrendType.Sideways
  }

  calculateCriticality(value, data, criticalityCalculation: Partial<CriticalityCalculationType>) {
    const toleranceRangeLowValue = _getValue(data, criticalityCalculation.ToleranceRangeLowValue)
    const toleranceRangeHighValue = _getValue(data, criticalityCalculation.ToleranceRangeHighValue)
    const deviationRangeLowValue = _getValue(data, criticalityCalculation.DeviationRangeLowValue)
    const deviationRangeHighValue = _getValue(data, criticalityCalculation.DeviationRangeHighValue)

    switch (criticalityCalculation.ImprovementDirection) {
      case ImprovementDirectionType.Maximize: {
        if (!isNil(toleranceRangeLowValue) && value >= toleranceRangeLowValue) {
          return CriticalityType.Positive
        } else if (!isNil(deviationRangeLowValue) && value < deviationRangeLowValue) {
          return CriticalityType.Negative
        }
        break
      }
      case ImprovementDirectionType.Minimize: {
        if (!isNil(toleranceRangeHighValue) && value <= toleranceRangeHighValue) {
          return CriticalityType.Positive
        } else if (!isNil(deviationRangeHighValue) && value > deviationRangeHighValue) {
          return CriticalityType.Negative
        }
        break
      }
      case ImprovementDirectionType.Target: {
        if (
          !isNil(toleranceRangeHighValue) &&
          value <= toleranceRangeHighValue &&
          !isNil(toleranceRangeLowValue) &&
          value >= toleranceRangeLowValue
        ) {
          return CriticalityType.Positive
        } else if (
          (!isNil(deviationRangeHighValue) && value > deviationRangeHighValue) ||
          (!isNil(deviationRangeLowValue) && value < deviationRangeLowValue)
        ) {
          return CriticalityType.Negative
        }
        break
      }
    }

    // Default Neutral
    return CriticalityType.Neutral
  }

  selectQuery(queryOptions: QueryOptions) {
    const kpiAnnotation = this.getKPIAnnotation()
    queryOptions = queryOptions ?? {}
    queryOptions.columns = queryOptions.columns ?? []
    queryOptions.columns.push(...this.getSelects(kpiAnnotation))

    if (isEmpty(queryOptions.columns)) {
      throw new Error(`No columns for kpi`)
    }
    return super.selectQuery(queryOptions)
  }

  getSelects(kpiAnnotation: KPIType): Array<Dimension | Measure> {
    const selects: Array<Dimension | Measure> = []
    if (kpiAnnotation?.DataPoint) {
      selects.push(...this.getDataPointFields(kpiAnnotation.DataPoint))
    }

    if (kpiAnnotation?.AdditionalDataPoints) {
      kpiAnnotation?.AdditionalDataPoints.forEach((dataPoint) => {
        selects.push(...this.getDataPointFields(dataPoint))
      })
    }

    return selects
  }

  getDataPointFields(dataPoint: Partial<DataPointType>) {
    const selects: Array<Dimension | Measure> = []
    // 主 Value 字段
    if (isMeasure(dataPoint.Value)) {
      selects.push(dataPoint.Value as Measure)
    }

    selects.push(
      ...this._getPatternPath(dataPoint, 'Title', 'Description', 'LongDescription')
        .map(({ value }) => value)
        .filter(nonBlank)
    )

    if (isMeasure(dataPoint.TargetValue)) {
      selects.push(dataPoint.TargetValue)
    }

    // Reference value for the calculation, e.g. number of sales for the last year
    if (dataPoint.TrendCalculation) {
      // keys of TrendCalculationType
      selects.push(
        ...this._getPath(
          dataPoint.TrendCalculation,
          'ReferenceValue',
          'IsRelativeDifference',
          'UpDifference',
          'StrongUpDifference',
          'DownDifference',
          'StrongDownDifference'
        )
      )
    }

    if (dataPoint.CriticalityCalculation) {
      // keys of CriticalityCalculationType
      selects.push(
        ...this._getPath(
          dataPoint.CriticalityCalculation,
          'ReferenceValue',
          'IsRelativeDifference',
          'AcceptanceRangeLowValue',
          'AcceptanceRangeHighValue',
          'ToleranceRangeLowValue',
          'ToleranceRangeHighValue',
          'DeviationRangeLowValue',
          'DeviationRangeHighValue'
        )
      )
    }

    return selects
  }

  _getPath(set, ...names) {
    return names.map((name) => (isString(set[name]) ? set[name] : null)).filter((field) => !!field)
  }

  _getPatternPath(set, ...names) {
    // TODO Extract fields matching expressions
    return names.map((name) => ({ name, value: set[name]?.match(/\{([0-9A-Za-z_\s\-\/\[\]]*)\}/)?.[1] }))
  }

  getKPIAnnotation() {
    return this.dataSettings?.KPIAnnotation
  }

  getDataPoint(): Partial<DataPointType> {
    return this.getKPIAnnotation()?.DataPoint
  }

  ngOnDestroy(): void {
    super.onDestroy()
  }
}

function _getValue(data: unknown, prop: Dimension | Measure | PrimitiveType) {
  return isDimension(prop) ? data[getPropertyName(prop)] : isMeasure(prop) ? data[getPropertyMeasure(prop)] : prop
}

/**
 * Transforms a string into a number (if needed).
 * In the future, we will support the function of converting empty strings to 0.
 */
function strToNumber(value: number | string): number {
  // Convert strings to numbers
  if (typeof value === 'string') {
    if (!isNaN(Number(value) - parseFloat(value))) {
      return Number(value)
    } else {
      return null
    }
  }
  if (typeof value !== 'number') {
    throw new Error(`${value} is not a number`)
  }
  return value
}
