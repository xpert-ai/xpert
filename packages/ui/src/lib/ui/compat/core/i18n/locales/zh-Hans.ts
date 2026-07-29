import { DateVariableEnum } from '../../models'

/**
 * 中文 shortNumber 基础配置
 */
export default {
  lang: 'zh-Hans',
  shortNumberFactor: 4,
  shortNumberUnits: '万,亿,万亿',

  DateVariable: {
    [DateVariableEnum.SYSTEMTIME]: '系统时间',
    [DateVariableEnum.TODAY]: '当前日期',
    [DateVariableEnum.YESTERDAY]: '昨天',
    [DateVariableEnum.DBY]: '前天',
    [DateVariableEnum.DAYS_7_AGO]: '七天前',
    [DateVariableEnum.DAYS_8_AGO]: '八天前',
    [DateVariableEnum.DAYS_14_AGO]: '十四天前',
    [DateVariableEnum.DAYS_15_AGO]: '十五天前',
    [DateVariableEnum.DAYS_30_AGO]: '三十天前',
    [DateVariableEnum.DAYS_31_AGO]: '三十一天前',
    [DateVariableEnum.RECENT_7_DAYS]: '最近七天',
    [DateVariableEnum.RECENT_14_DAYS]: '最近十四天',
    [DateVariableEnum.RECENT_30_DAYS]: '最近三十天',
    [DateVariableEnum.RECENT_90_DAYS]: '最近九十天',
    [DateVariableEnum.RECENT_180_DAYS]: '最近一百八十天',
    [DateVariableEnum.THIS_WEEK]: '本周',
    [DateVariableEnum.THIS_MONTH]: '本月',
    [DateVariableEnum.PREVIOUS_MONTH]: '上月',
    [DateVariableEnum.THIS_QUARTER]: '本季度',
    [DateVariableEnum.YEAR_TO_TODAY]: '当前年至当天',
    [DateVariableEnum.YEAR_TO_YESTERDAY]: '当前年至昨天',
    [DateVariableEnum.THIS_WHOLE_WEEK]: '本周(包含整周)',
    [DateVariableEnum.THIS_WHOLE_MONTH]: '本月(包含整月)',
    [DateVariableEnum.THIS_WHOLE_QUARTER]: '本季度(包含整季度)',
    [DateVariableEnum.THIS_WHOLE_YEAR]: '今年(包含整年)',
    [DateVariableEnum.PREVIOUS_YEAR]: '去年'
  },

  NgCore: {
    Widget: {
      Rank: '排名',
      Top: '前'
    }
  }
}
