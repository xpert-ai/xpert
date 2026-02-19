import { C_MEASURES, OrderDirection } from '@metad/ocap-core'
import { CHART_ANNOTATION, DATA, SALES_ENTITY_TYPE } from './mock'
import { getMatrixForMeasure, stackedForMeasure } from './stacked'

describe('Stacked', () => {
  it('#getMatrixForMeasure', () => {
    expect(
      getMatrixForMeasure(
        DATA,
        SALES_ENTITY_TYPE,
        {
          dimension: '[Time]',
          order: OrderDirection.DESC
        },
        {
          dimension: '[Product]'
        },
        {
          dimension: C_MEASURES,
          measure: 'sales',
          order: OrderDirection.DESC
        },
      )
    ).toEqual({
      category2Values: [
        { label: 'B', value: '[B]' },
        { label: 'A', value: '[A]' },
      ],
      categoryValues: [
        { label: '2021', value: '[2021]' },
        { label: '2020', value: '[2020]' }
      ],
      source: [
        ['[Product]', '[2021]', '[2020]'],
        ['[B]', 160, 200],
        ['[A]', 50, 100],
      ]
    })
  })

  it('#stackedForMeasure', () => {
    const result = stackedForMeasure(
      DATA,
      {
        dimension: C_MEASURES,
        measure: 'sales'
      },
      CHART_ANNOTATION,
      SALES_ENTITY_TYPE
    )
    expect(
      result.dataset
    ).toEqual({
      categories: [
        { label: '2020', value: '[2020]' },
        { label: '2021', value: '[2021]' }
      ],
      id: '--sales',
      measure: 'sales',
      series: [
        { label: 'A', value: '[A]' },
        { label: 'B', value: '[B]' }
      ],
      source: [
        ['[Product]', '[2020]', '[2021]'],
        ['[A]', 100, 50],
        ['[B]', 200, 160]
      ]
    })

    expect(
      result.seriesComponents
    ).toEqual([
      {
        caption: 'A',
        formatting: undefined,
        id: '[A]sales',
        measure: 'sales',
        member: { label: 'A', value: '[A]' },
        name: 'Asales',
        property: { name: 'sales', role: 'measure' },
        seriesLayoutBy: 'row',
        seriesStack: 'sales',
        valueAxisIndex: 0
      },
      {
        caption: 'B',
        formatting: undefined,
        id: '[B]sales',
        measure: 'sales',
        member: { label: 'B', value: '[B]' },
        name: 'Bsales',
        property: { name: 'sales', role: 'measure' },
        seriesLayoutBy: 'row',
        seriesStack: 'sales',
        valueAxisIndex: 0
      }
    ])
  })
})
