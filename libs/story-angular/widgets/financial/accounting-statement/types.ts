import { PeriodFunctions } from "@xpert-ai/ocap-core"

export enum ValueType {
  PROPORTION = 'proportion',
  GAP = 'gap'
}

export interface IndicatorOption {
  groupName: string
  name: string
  id: string
  isItalic: boolean
  isUnderline: boolean
  digitsInfo: string
  digitsUnit: string
  reverseSemanticColor: boolean
}

export interface AccountingStatementOptions {
  name: string
  denominator: number
  unit: string
  digitsInfo: string
  measures: Array<{
    name: PeriodFunctions
    label: string
    isRatio: boolean // 是比率字段
    digitsInfo: string
    isSemanticColor: boolean
    reverseSemanticColor: boolean
  }>
  indicators: Array<IndicatorOption>
  hideHeader: boolean
}

export enum ArrowDirection {
  UP = 'UP',
  DOWN = 'DOWN'
}
