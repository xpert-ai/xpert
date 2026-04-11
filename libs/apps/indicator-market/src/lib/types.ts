import { IIndicator, TimeGranularity } from '@xpert-ai/contracts'
import { Trend } from '@xpert-ai/ocap-angular/indicator'
import { DataSettings, Indicator } from '@xpert-ai/ocap-core'

export { TrendColor, TrendReverseColor, Trend } from '@xpert-ai/ocap-angular/indicator'
export { IndicatorTagEnum } from '@xpert-ai/ocap-core'

export interface IndicatorState extends Partial<Indicator>, Omit<IIndicator, 'type'> {
  initialized: boolean
  loaded: boolean
  lookBack: number
  dataSettings: DataSettings
  /**
   * @deprecated
   */
  data: { CURRENT?: number; [key: string]: any }
  /**
   * @deprecated
   */
  trends: Array<unknown>
  /**
   * @deprecated
   */
  trend: Trend
  favour: boolean
  error?: string
}

// 分批请求的批次大小
export const INDICATOR_BATCH_SIZE = 50
export enum StatisticalType {
  CurrentPeriod = 'CurrentPeriod',
  Accumulative = 'Accumulative',
  Yoy = 'Yoy',
  Mom = 'Mom'
}

export const ItemMaxLookback = 30
export const LookbackDefault = {
  [TimeGranularity.Year]: 5,
  [TimeGranularity.Quarter]: 8,
  [TimeGranularity.Month]: 24,
  [TimeGranularity.Week]: 24,
  [TimeGranularity.Day]: 30
}

export const LookbackLimit = {
  [TimeGranularity.Year]: 10,
  [TimeGranularity.Quarter]: 40,
  [TimeGranularity.Month]: 120,
  [TimeGranularity.Week]: 240,
  [TimeGranularity.Day]: 365
}