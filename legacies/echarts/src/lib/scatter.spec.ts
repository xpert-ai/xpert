import { C_MEASURES } from '@metad/ocap-core'
import { getCoordinateSystem } from './components/coordinate'
import { SALES_ENTITY_TYPE } from './mock'
import { EChartsContext } from './types'

describe('Scatter Coordinate', () => {
  let context: EChartsContext
  beforeEach(() => {
    context = {
      data: { data: [] },
      chartAnnotation: {
        chartType: {
          type: 'Scatter'
        },
        dimensions: [
          {
            dimension: '[Time]'
          }
        ],
        measures: [
          {
            dimension: C_MEASURES,
            measure: 'sales'
          }
        ]
      },
      entityType: SALES_ENTITY_TYPE,
      settings: {},
      options: {}
    } as any
  })

  it('#Basic', () => {
    const c = getCoordinateSystem(context, [], 'zh-Hans')

    expect(c).toMatchObject({
      valueAxis: { axis: [undefined], orient: 'yAxis' }
    })
    expect(c.categoryAxis).toMatchObject({
      orient: 'xAxis'
    })
  })
})
