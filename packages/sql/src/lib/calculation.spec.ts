import { CalculatedProperty, CalculationType, RestrictedMeasureProperty } from '@xpert-ai/ocap-core'
import { serializeCalculationProperty, serializeRestrictedMeasure } from './calculation'
import { CubeContext } from './cube'
import { CUBE_SALESORDER, ENTITY_TYPE_SALESORDER } from './mock-data'

const CUBE_CONTEXT: CubeContext = {
  schema: CUBE_SALESORDER,
  entityType: ENTITY_TYPE_SALESORDER,
  factTable: `[sales]_sales_fact`,
  dimensions: [],
  measures: []
}

describe('serializeCalculationProperty', () => {
  it('#serializeCalculationProperty', () => {
    expect(
      serializeCalculationProperty(
        null,
        {
          name: 'rato',
          calculationType: CalculationType.Calculated,
          formula: `("measure1" / "measure2")`
        } as CalculatedProperty,
        true,
        ''
      )
    ).toEqual(`("measure1" / "measure2")`)
  })
})

describe('Serialize Indicator', () => {
  it('Serialize Indicator Measure with members', async () => {
    expect(
      serializeRestrictedMeasure(
        {
          ...CUBE_CONTEXT,
          entityType: {
            ...CUBE_CONTEXT.entityType,
            dialect: 'pg'
          }
        },
        ENTITY_TYPE_SALESORDER.properties['I1'] as RestrictedMeasureProperty,
        true,
        'pg'
      )
    ).toEqual(
      `SUM( CASE WHEN ( ( "[product]_product"."brand_name" = 'Excel' AND "[product]_product"."product_name" = 'Excel Monthly Auto Magazine' ) OR ( "[product]_product"."brand_name" = 'CDR' ) ) AND ( "[customer]_customer"."country" = 'USA' AND "[customer]_customer"."city" = 'San Francisco' ) THEN "[sales]_sales_fact"."store_sales" ELSE NULL END )`
    )
  })

  it('Serialize Indicator Measure with exclude members', async () => {
    expect(
      serializeRestrictedMeasure(
        {
          ...CUBE_CONTEXT,
          entityType: {
            ...CUBE_CONTEXT.entityType,
            dialect: 'pg'
          }
        },
        ENTITY_TYPE_SALESORDER.properties['I2'] as RestrictedMeasureProperty,
        true,
        'pg'
      )
    ).toEqual(
      `SUM( CASE WHEN ( ( "[product]_product"."brand_name" = 'Excel' AND "[product]_product"."product_name" = 'Excel Monthly Auto Magazine' ) OR ( "[product]_product"."brand_name" = 'CDR' ) ) AND ( NOT ( "[customer]_customer"."country" = 'USA' ) ) THEN "[sales]_sales_fact"."store_sales" ELSE NULL END )`
    )
  })

  it('Serialize Indicator Measure with AllMember', async () => {
    expect(
      serializeRestrictedMeasure(
        {
          ...CUBE_CONTEXT,
          entityType: {
            ...CUBE_CONTEXT.entityType,
            dialect: 'pg'
          }
        },
        ENTITY_TYPE_SALESORDER.properties['IwithAllMember'] as RestrictedMeasureProperty,
        true,
        'pg'
      )
    ).toEqual(
      `SUM( CASE WHEN ( "[product]_product"."brand_name" = 'Excel' AND "[product]_product"."product_name" = 'Excel Monthly Auto Magazine' ) OR ( "[product]_product"."brand_name" = 'CDR' ) THEN "[sales]_sales_fact"."store_sales" ELSE NULL END )`
    )
  })

  it('Serialize Indicator Measure with formula', async () => {
    expect(
      serializeRestrictedMeasure(
        {
          ...CUBE_CONTEXT,
          entityType: {
            ...CUBE_CONTEXT.entityType,
            dialect: 'pg'
          }
        },
        ENTITY_TYPE_SALESORDER.properties['I3'] as RestrictedMeasureProperty,
        true,
        'pg'
      )
    ).toEqual(
      `SUM( CASE WHEN ( ( "[product]_product"."brand_name" = 'Excel' AND "[product]_product"."product_name" = 'Excel Monthly Auto Magazine' ) OR ( "[product]_product"."brand_name" = 'CDR' ) ) AND ( NOT ( "[customer]_customer"."country" = 'USA' ) ) THEN "[sales]_sales_fact"."store_sales" - "[sales]_sales_fact"."store_cost" ELSE NULL END )`
    )
  })

  it('Serialize Indicator Measure with indicators', async () => {
    expect(
      serializeRestrictedMeasure(
        {
          ...CUBE_CONTEXT,
          entityType: {
            ...CUBE_CONTEXT.entityType,
            dialect: 'pg'
          }
        },
        ENTITY_TYPE_SALESORDER.properties['I4'] as RestrictedMeasureProperty,
        true,
        'pg'
      )
    ).toEqual(
      `SUM( CASE WHEN ( ( "[product]_product"."brand_name" = 'Excel' AND "[product]_product"."product_name" = 'Excel Monthly Auto Magazine' ) OR ( "[product]_product"."brand_name" = 'CDR' ) ) AND ( NOT ( "[customer]_customer"."country" = 'USA' ) ) THEN "[sales]_sales_fact"."store_sales" - "[sales]_sales_fact"."store_cost" ELSE NULL END ) / SUM( CASE WHEN ( ( "[product]_product"."brand_name" = 'Excel' AND "[product]_product"."product_name" = 'Excel Monthly Auto Magazine' ) OR ( "[product]_product"."brand_name" = 'CDR' ) ) AND ( "[customer]_customer"."country" = 'USA' AND "[customer]_customer"."city" = 'San Francisco' ) THEN "[sales]_sales_fact"."store_sales" ELSE NULL END )`
    )
  })

  it('Serialize Indicator Measure with distinct count', async () => {
    expect(
      serializeRestrictedMeasure(
        {
          ...CUBE_CONTEXT,
          entityType: {
            ...CUBE_CONTEXT.entityType,
            dialect: 'pg'
          }
        },
        ENTITY_TYPE_SALESORDER.properties['IwithCount'] as RestrictedMeasureProperty,
        true,
        'pg'
      )
    ).toEqual(
      `COUNT(DISTINCT CASE WHEN ( "[product]_product"."brand_name" = 'Excel' AND "[product]_product"."product_name" = 'Excel Monthly Auto Magazine' ) OR ( "[product]_product"."brand_name" = 'CDR' ) THEN [Customer] ELSE NULL END )`
    )
  })
})
