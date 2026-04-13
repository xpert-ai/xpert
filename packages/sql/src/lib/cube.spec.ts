import { CalculationProperty, C_MEASURES, pick, pickBy } from '@xpert-ai/ocap-core'
import { buildCubeContext, buildLevelContext, compileCubeSchema } from './cube'
import { buildDimensionContext, DimensionContext } from './dimension'
import {
  CUBE_SALESORDER,
  ENTITY_TYPE_SALESORDER,
  PRODUCT_DIMENSION,
  SHARED_DIMENSION_CUSTOMER,
  SHARED_DIMENSION_TIME
} from './mock-data'


describe('SQL Cube', () => {

  it('Query Cube', () => {
    expect(
      compileCubeSchema(
        CUBE_SALESORDER.name,
        CUBE_SALESORDER,
        [PRODUCT_DIMENSION, SHARED_DIMENSION_TIME, SHARED_DIMENSION_CUSTOMER],
        ''
      )
    ).toEqual({
      ...ENTITY_TYPE_SALESORDER,
      properties: pickBy(ENTITY_TYPE_SALESORDER.properties, (v) => !v.name.startsWith('I'))
    })
  })

  it('Build Cube Context', () => {
    const cubeContext = buildCubeContext(
      CUBE_SALESORDER,
      {
        rows: [
          {
            dimension: '[Time]',
            hierarchy: '[Time.Weekly]',
            level: '[Time.Weekly].[Week]'
          }
        ]
      },
      ENTITY_TYPE_SALESORDER,
      ''
    )
    expect(cubeContext.dimensions[0].levels[0].selectFields).toEqual([
      {
        alias: '[Time.Weekly]',
        columns: [
          {
            table: '[time.weekly]_time_by_day',
            column: 'the_year',
            cast: 'VARCHAR'
          },
          {
            table: '[time.weekly]_time_by_day',
            column: 'week_of_year',
          }
        ]
      },
      {
        table: '[time.weekly]_time_by_day',
        column: 'week_of_year',
        alias: '[Time.Weekly].[MEMBER_CAPTION]'
      }
    ])
  })

  it('Build cube context with Degenerate dimension', () => {
    const cubeContext = buildCubeContext(
      CUBE_SALESORDER,
      {
        rows: [
          {
            dimension: '[Payment method]',
            hierarchy: '[Payment method]',
            level: '[Payment method].[Payment method]'
          }
        ]
      },
      ENTITY_TYPE_SALESORDER,
      ''
    )
    expect(cubeContext.dimensions[0].levels[0].selectFields).toEqual([
      {
        alias: '[Payment method]',
        columns: [
          {
            column: 'payment_method',
            table: 'salesorder_sales_fact',
          }
        ]
      },
      {
        alias: '[Payment method].[MEMBER_CAPTION]',
        column: 'payment_method',
        table: 'salesorder_sales_fact'
      }
    ])
  })

  it('with Calculated Member', () => {
    const cubeContext = buildCubeContext(
      CUBE_SALESORDER,
      {
        rows: [
          {
            dimension: '[Payment method]',
            hierarchy: '[Payment method]',
            level: '[Payment method].[Payment method]'
          }
        ],
        columns: [
          {
            dimension: C_MEASURES,
            measure: 'Profit'
          }
        ]
      },
      ENTITY_TYPE_SALESORDER,
      ''
    )
    expect((cubeContext.measures[0] as unknown as CalculationProperty).calculationType).toEqual('Calculated')
  })

  it('Multiple measures', () => {
    const cubeContext = buildCubeContext(
      CUBE_SALESORDER,
      {
        rows: [
          {
            dimension: '[Product]',
            hierarchy: '[Product]',
            level: '[Product].[Brand Name]'
          }
        ],
        columns: [
          {
            dimension: C_MEASURES,
            measure: 'Sales'
          },
          {
            dimension: C_MEASURES,
            measure: 'Cost'
          }
        ]
      },
      ENTITY_TYPE_SALESORDER,
      ''
    )

    expect(cubeContext.dimensions[1].members).toEqual([
      {
        value: 'Sales',
        label: '销售额'
      },
      {
        value: 'Cost',
        label: '成本'
      }
    ])
  })
})

describe('Cube Level', () => {
  beforeAll(() => {
    //
  })

  it('#buildLevelContext', () => {
    const dimension = {
      dimension: '[Product]',
      hierarchy: '[Product]',
      level: '[Product].[Brand Name]'
    }

    expect(
      buildLevelContext(
        buildDimensionContext(
          { factTable: '[Sales]_sales_fact' } as DimensionContext,
          ENTITY_TYPE_SALESORDER,
          dimension,
          'pg'
        ),
        dimension,
        ENTITY_TYPE_SALESORDER.properties['[Product]'].hierarchies[0].levels[1],
        1
      )
    ).toEqual({
      groupBys: [{ column: 'brand_name', table: '[product]_product' }],
      level: {
        __id__: '1e8f6622-6ce2-4187-8ae6-0be581614804',
        caption: '品牌',
        captionColumn: null,
        column: 'brand_name',
        dimension: '[Product]',
        entity: 'SalesOrder',
        hierarchy: '[Product]',
        levelNumber: 1,
        memberCaption: '[Product].[Brand Name].[MEMBER_CAPTION]',
        name: '[Product].[Brand Name]',
        nameColumn: null,
        nullParentValue: null,
        ordinalColumn: null,
        parentColumn: null,
        properties: [],
        role: 'level',
        table: 'product',
        uniqueMembers: true
      },
      orderBys: [{ column: 'brand_name', table: '[product]_product' }],
      selectFields: [
        {
          alias: undefined,
          columns: [
            {
              column: 'brand_name',
              table: '[product]_product',
            }
          ]
        },
        { alias: '[Product].[MEMBER_CAPTION]', column: 'brand_name', table: '[product]_product' }
      ]
    })
  })
})
