import { Property } from '../models'
import { Dimension, Measure } from '../types'

export interface AnalyticsMeasure extends Measure {
  /**
   */
  palette?: {
    name?: string
    reverse?: boolean
    pattern?: any
    colors?: string[]
  }
  domain?: [number, number?]
}

export interface AnalyticsAnnotation {
  rows: Array<(Dimension | AnalyticsMeasure) & { property?: Property }>
  columns: Array<(Dimension | AnalyticsMeasure) & { property?: Property }>
}
