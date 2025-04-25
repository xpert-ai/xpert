import { ChartAnnotation, ChartSettings, DataSettings, ISlicer, KPIType, OrderBy, TimeRangesSlicer } from '@metad/ocap-core'

/**
 * @deprecated use ChatBI toolset.
 */
export interface QuestionAnswer {
  key: string
  chartOptions: any
  dataSettings: DataSettings
  chartSettings: ChartSettings
  options?: any
  expanded: boolean
  /**
   * @deprecated 还在用吗？
   */
  message: string
  slicers: ISlicer[]
  timeSlicers: TimeRangesSlicer[]
  /**
   * Snapshot of ids of current indicators (i.e. calculated measures)
   */
  indicators: string[]
  /**
   * @deprecated 还在用吗？
   */
  title: string
  visualType?: 'table' | 'chart' | 'kpi'
  chartAnnotation?: ChartAnnotation
  kpi?: KPIType
  variables?: ISlicer[]
  orders?: OrderBy[]
  top?: number
}

/**
 * @deprecated use ChatBI toolset.
 */
export function isQuestionAnswer(input: unknown): input is QuestionAnswer {
  return typeof (input as QuestionAnswer).key === 'string'
}