import { ChartDataZoomType } from '@metad/ocap-core'
import { AxisEnum } from '../types'
import { getAxisDataZooms } from './data-zoom'

describe('dataZoom', () => {
  it('#Basic', () => {
    expect(getAxisDataZooms({ chartOptions: { dataZoom: { type: ChartDataZoomType.inside } } }, AxisEnum.x)).toEqual([
      {
        type: 'inside',
        xAxisIndex: 0
      }
    ])
  })
})
