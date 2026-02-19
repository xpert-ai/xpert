import { AggregationRole, ChartAnnotation, ChartDimensionRoleType, C_MEASURES, EntityType } from '@metad/ocap-core'

export const SALES_ENTITY_TYPE: EntityType = {
  name: 'Sales',
  visible: true,
  properties: {
    '[Time]': {
      name: '[Time]',
      role: AggregationRole.dimension,
      memberCaption: '[Time].[MEMBER_CAPTION]'
    },
    '[Product]': {
      name: '[Product]',
      role: AggregationRole.dimension,
      memberCaption: '[Product].[MEMBER_CAPTION]'
    },
    sales: {
      name: 'sales',
      role: AggregationRole.measure
    }
  }
}

export const CHART_ANNOTATION: ChartAnnotation = {
  chartType: {
    type: 'Bar'
  },
  dimensions: [
    {
      dimension: '[Time]'
    },
    {
      dimension: '[Product]',
      role: ChartDimensionRoleType.Stacked
    }
  ],
  measures: [
    {
      dimension: C_MEASURES,
      measure: 'sales'
    }
  ]
}

export const DATA = [
  {
    '[Time]': '[2020]',
    '[Time].[MEMBER_CAPTION]': '2020',
    '[Product]': '[A]',
    '[Product].[MEMBER_CAPTION]': 'A',
    sales: 100
  },
  {
    '[Time]': '[2020]',
    '[Time].[MEMBER_CAPTION]': '2020',
    '[Product]': '[B]',
    '[Product].[MEMBER_CAPTION]': 'B',
    sales: 200
  },
  {
    '[Time]': '[2021]',
    '[Time].[MEMBER_CAPTION]': '2021',
    '[Product]': '[A]',
    '[Product].[MEMBER_CAPTION]': 'A',
    sales: 50
  },
  {
    '[Time]': '[2021]',
    '[Time].[MEMBER_CAPTION]': '2021',
    '[Product]': '[B]',
    '[Product].[MEMBER_CAPTION]': 'B',
    sales: 160
  },
]
