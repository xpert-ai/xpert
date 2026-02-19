import { C_MEASURES } from '@metad/ocap-core'
import { getCoordinateSystem } from './components/coordinate'
import { CHART_ANNOTATION, SALES_ENTITY_TYPE } from './mock'
import { EChartsContext } from './types'
import { measuresToSeriesComponents } from './components/series'

describe('CoordinateSystem', () => {
  let context: EChartsContext
  beforeEach(() => {
    context = {
      data: {data: []},
      chartAnnotation: {
        chartType: {
          type: 'Bar'
        },
        dimensions: [
          {
            dimension: '[Time]'
          },
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

    // expect(c).toMatchObject({
    //   valueAxis: { axis: [undefined], orient: 'yAxis' }
    // })
    expect(c.categoryAxis).toMatchObject({
      orient: 'xAxis'
    })
  })

  it('#Polar', () => {
    const c = getCoordinateSystem(
      {
        ...context,
        chartAnnotation: { ...CHART_ANNOTATION, chartType: { type: 'Bar', variant: 'polar' } }
      },
      [],
      'zh-Hans'
    )

    // expect(c).toMatchObject({
    //   valueAxis: {
    //     axis: [
    //       {
    //         axisLabel: {
    //         },
    //         type: 'value'
    //       }
    //     ],
    //     orient: 'yAxis'
    //   }
    // })

    expect(c.categoryAxis).toMatchObject({
      orient: 'xAxis'
    })
  })

  it('#measuresToSeriesComponents', () => {
    const seriesComponents = measuresToSeriesComponents(CHART_ANNOTATION.measures, [], SALES_ENTITY_TYPE, {})

    expect(seriesComponents[0]).toEqual(
      expect.objectContaining({
        id: 'sales',
        measure: 'sales',
        valueAxisIndex: 0
      })
    )
  })
})
