export enum PeriodFunctions {
  CURRENT = 'CURRENT',
  /**
   * Year-to-date
   */
  YTD = 'YTD',
  /**
   * Quarter-to-date
   */
  QTD = 'QTD',
  /**
   * Week-to-date
   */
  WTD = 'WTD',
  /**
   * Month-to-date
   */
  MTD = 'MTD',
  /**
   * Previous year year-to-date
   */
  PYYTD = 'PYYTD',
  /**
   * Year-over-year
   */
  YOY = 'YOY',
  /**
   * Year-over-year difference (current - previous year same period)
   */
  YOYGAP = 'YOYGAP',
  /**
   * Month-over-month
   */
  MOM = 'MOM',
  /**
   * Month-over-month difference (current - previous period)
   */
  MOMGAP = 'MOMGAP',
  /**
   * Year-to-date month-over-month
   */
  YTDOM = 'YTDOM',
  /**
   * Year-to-date year-over-year
   */
  YTDOY = 'YTDOY',
  /**
   * Year-to-date year-over-year difference
   */
  YTDOYGAP = 'YTDOYGAP',
  /**
   * Previous period
   */
  MPM = 'MPM',
  /**
   * Previous period year-over-year
   */
  MPMYOY = 'MPMYOY',
  /**
   * Previous year same period
   */
  PYSM = 'PYSM',
  /**
   * Previous year same period year-over-year
   */
  PYSMYOY = 'PYSMYOY'
}