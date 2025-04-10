import { NGX_ECHARTS_CONFIG, NgxEchartsConfig } from 'ngx-echarts'

export function provideECharts(config?: NgxEchartsConfig) {
  return [{ provide: NGX_ECHARTS_CONFIG, useValue: config }]
}
