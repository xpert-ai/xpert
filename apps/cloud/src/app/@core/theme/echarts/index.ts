import { registerTheme } from 'echarts/core'
import { COSMIC_THEME } from './theme.cosmic'
import { DARK_THEME } from './theme.dark'
import { DEFAULT_THEME } from './theme.default'

export function registerEChartsThemes() {
  registerTheme(DEFAULT_THEME.name, DEFAULT_THEME.chartTheme)
  registerTheme('light', DEFAULT_THEME.chartTheme)
  registerTheme(DARK_THEME.name, DARK_THEME.chartTheme)
  registerTheme(COSMIC_THEME.name, COSMIC_THEME.chartTheme)
}
