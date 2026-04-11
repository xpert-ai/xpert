import { FilteringLogic, FilterOperator, IAdvancedFilter } from '@xpert-ai/ocap-core'
import { CUBE_SALESORDER, ENTITY_TYPE_SALESORDER } from './mock-data'
import { compileFilters, compileMembers, compileSlicer } from './sql-filter'

describe('convertFiltersToSQL', () => {
  it('#explainSlicer', () => {
    expect(
      compileSlicer(
        {
          dimension: {
            dimension: '[Product]'
          },
          members: [
            {
              value: '[A]'
            },
            {
              value: '[Brand (1)]'
            }
          ]
        },
        {
          schema: CUBE_SALESORDER,
          entityType: ENTITY_TYPE_SALESORDER,
          factTable: 'sales_fact',
          dimensions: [],
          measures: []
        },
        ''
      )
    ).toEqual("( `[product]_product`.`brand_name` = 'A' ) OR ( `[product]_product`.`brand_name` = 'Brand (1)' )")

    expect(
      compileSlicer(
        {
          dimension: {
            dimension: '[Product]'
          },
          members: [
            {
              value: '[A].[B]'
            },
            {
              value: '[Brand (1)].[Product: 2]'
            }
          ]
        },
        {
          schema: CUBE_SALESORDER,
          entityType: ENTITY_TYPE_SALESORDER,
          factTable: 'sales_fact',
          dimensions: [],
          measures: []
        },
        ''
      )
    ).toEqual(
      "( `[product]_product`.`brand_name` = 'A' AND `[product]_product`.`product_name` = 'B' ) OR ( `[product]_product`.`brand_name` = 'Brand (1)' AND `[product]_product`.`product_name` = 'Product: 2' )"
    )

    expect(
      compileSlicer(
        {
          dimension: {
            dimension: '[Product]'
          },
          members: [
            {
              value: '[A]'
            },
            {
              value: '[Brand (1)].[Product: 2]'
            }
          ]
        },
        {
          schema: CUBE_SALESORDER,
          entityType: ENTITY_TYPE_SALESORDER,
          factTable: 'sales_fact',
          dimensions: [],
          measures: []
        },
        ''
      )
    ).toEqual(
      "( `[product]_product`.`brand_name` = 'A' ) OR ( `[product]_product`.`brand_name` = 'Brand (1)' AND `[product]_product`.`product_name` = 'Product: 2' )"
    )
  })

  it('#explainSlicer exclude members', () => {
    expect(
      compileSlicer(
        {
          dimension: {
            dimension: '[Product]'
          },
          exclude: true,
          members: [
            {
              value: '[A]'
            },
            {
              value: '[Brand (1)]'
            }
          ]
        },
        {
          schema: CUBE_SALESORDER,
          entityType: ENTITY_TYPE_SALESORDER,
          factTable: 'sales_fact',
          dimensions: [],
          measures: []
        },
        ''
      )
    ).toEqual("NOT ( `[product]_product`.`brand_name` = 'A' ) AND NOT ( `[product]_product`.`brand_name` = 'Brand (1)' )")

    expect(
      compileSlicer(
        {
          dimension: {
            dimension: '[Product]'
          },
          exclude: true,
          members: [
            {
              value: '[A].[B]'
            },
            {
              value: '[Brand (1)].[Product: 2]'
            }
          ]
        },
        {
          schema: CUBE_SALESORDER,
          entityType: ENTITY_TYPE_SALESORDER,
          factTable: 'sales_fact',
          dimensions: [],
          measures: []
        },
        ''
      )
    ).toEqual(
      "NOT ( `[product]_product`.`brand_name` = 'A' AND `[product]_product`.`product_name` = 'B' ) AND NOT ( `[product]_product`.`brand_name` = 'Brand (1)' AND `[product]_product`.`product_name` = 'Product: 2' )"
    )

    expect(
      compileSlicer(
        {
          dimension: {
            dimension: '[Product]'
          },
          exclude: true,
          members: [
            {
              value: '[A]'
            },
            {
              value: '[Brand (1)].[Product: 2]'
            }
          ]
        },
        {
          schema: CUBE_SALESORDER,
          entityType: ENTITY_TYPE_SALESORDER,
          factTable: 'sales_fact',
          dimensions: [],
          measures: []
        },
        ''
      )
    ).toEqual(
      "NOT ( `[product]_product`.`brand_name` = 'A' ) AND NOT ( `[product]_product`.`brand_name` = 'Brand (1)' AND `[product]_product`.`product_name` = 'Product: 2' )"
    )
  })

  it('#explainSlicer with Degenerate dimension', () => {
    expect(
      compileSlicer(
        {
          dimension: {
            dimension: '[Payment method]'
          },
          members: [
            {
              value: '[Credit]'
            },
            {
              value: '[ATM]'
            }
          ]
        },
        {
          schema: CUBE_SALESORDER,
          entityType: ENTITY_TYPE_SALESORDER,
          factTable: 'sales_fact',
          dimensions: [],
          measures: []
        },
        ''
      )
    ).toEqual("( `sales_fact`.`payment_method` = 'Credit' ) OR ( `sales_fact`.`payment_method` = 'ATM' )")
  })

  it('Compile AllMember', () => {
    expect(
      compileMembers([
        {
          value: '[(All)]'
        }
      ],
        ENTITY_TYPE_SALESORDER.properties['[Time]'].hierarchies[0].levels.slice(1),
        {
          dialect: 'pg',
          selectFields: [],
          role: 'row',
          hierarchy: ENTITY_TYPE_SALESORDER.properties['[Time]'].hierarchies[0],
          factTable: '[sales_order]'
        },)
    ).toEqual([[]])
  })

  it('#explainSlicer with operators', () => {

    expect(
      compileMembers([{
          value: '[2019].[12]'
        }],
        ENTITY_TYPE_SALESORDER.properties['[Time]'].hierarchies[0].levels.slice(1),
        {
          dialect: 'pg',
          selectFields: [],
          role: 'row',
          hierarchy: ENTITY_TYPE_SALESORDER.properties['[Time]'].hierarchies[0],
          factTable: '[sales_order]'
        },
      )
    ).toEqual([
      [
        {
          columnName: '"[sales_order]"."the_year"',
          value: `2019`
        },
        {
          columnName: '"[sales_order]"."quarter"',
          value: `'12'`
        }
      ]
    ])

    expect(
      compileSlicer(
        {
          dimension: {
            dimension: '[Time]'
          },
          operator: FilterOperator.GT,
          members: [
            {
              value: 2019
            },
          ]
        },
        {
          schema: CUBE_SALESORDER,
          entityType: ENTITY_TYPE_SALESORDER,
          factTable: 'sales_fact',
          dimensions: [],
          measures: []
        },
        ''
      )
    ).toEqual("`[time]_time_by_day`.`the_year` > 2019")

    expect(
      compileSlicer(
        {
          dimension: {
            dimension: '[Time]'
          },
          operator: FilterOperator.GT,
          members: [
            {
              value: '[2019].[12]'
            },
          ]
        },
        {
          schema: CUBE_SALESORDER,
          entityType: ENTITY_TYPE_SALESORDER,
          factTable: 'sales_fact',
          dimensions: [],
          measures: []
        },
        ''
      )
    ).toEqual("`[time]_time_by_day`.`the_year` > 2019 OR ( `[time]_time_by_day`.`the_year` = 2019 AND `[time]_time_by_day`.`quarter` > '12' )")

    expect(
      compileSlicer(
        {
          dimension: {
            dimension: '[Time]'
          },
          operator: FilterOperator.GE,
          members: [
            {
              value: '[2019].[12]'
            },
          ]
        },
        {
          schema: CUBE_SALESORDER,
          entityType: ENTITY_TYPE_SALESORDER,
          factTable: 'sales_fact',
          dimensions: [],
          measures: []
        },
        ''
      )
    ).toEqual("`[time]_time_by_day`.`the_year` > 2019 OR ( `[time]_time_by_day`.`the_year` = 2019 AND `[time]_time_by_day`.`quarter` > '12' ) OR ( `[time]_time_by_day`.`the_year` = 2019 AND `[time]_time_by_day`.`quarter` = '12' )")

    expect(
      compileSlicer(
        {
          dimension: {
            dimension: '[Time]'
          },
          operator: FilterOperator.LT,
          members: [
            {
              value: '[2019].[12]'
            },
          ]
        },
        {
          schema: CUBE_SALESORDER,
          entityType: ENTITY_TYPE_SALESORDER,
          factTable: 'sales_fact',
          dimensions: [],
          measures: []
        },
        ''
      )
    ).toEqual("`[time]_time_by_day`.`the_year` < 2019 OR ( `[time]_time_by_day`.`the_year` = 2019 AND `[time]_time_by_day`.`quarter` < '12' )")

    expect(
      compileSlicer(
        {
          dimension: {
            dimension: '[Time]'
          },
          operator: FilterOperator.LE,
          members: [
            {
              value: '[2019].[12]'
            },
          ]
        },
        {
          schema: CUBE_SALESORDER,
          entityType: ENTITY_TYPE_SALESORDER,
          factTable: 'sales_fact',
          dimensions: [],
          measures: []
        },
        ''
      )
    ).toEqual("`[time]_time_by_day`.`the_year` < 2019 OR ( `[time]_time_by_day`.`the_year` = 2019 AND `[time]_time_by_day`.`quarter` < '12' ) OR ( `[time]_time_by_day`.`the_year` = 2019 AND `[time]_time_by_day`.`quarter` = '12' )")

    expect(
      compileSlicer(
        {
          dimension: {
            dimension: '[Time]'
          },
          operator: FilterOperator.BT,
          members: [
            {
              value: '[2019].[12]'
            },
            {
              value: '[2022].[01]'
            },
          ]
        },
        {
          schema: CUBE_SALESORDER,
          entityType: ENTITY_TYPE_SALESORDER,
          factTable: 'sales_fact',
          dimensions: [],
          measures: []
        },
        ''
      )
    ).toEqual("( `[time]_time_by_day`.`the_year` > 2019 OR ( `[time]_time_by_day`.`the_year` = 2019 AND `[time]_time_by_day`.`quarter` > '12' ) OR ( `[time]_time_by_day`.`the_year` = 2019 AND `[time]_time_by_day`.`quarter` = '12' ) ) AND ( `[time]_time_by_day`.`the_year` < 2022 OR ( `[time]_time_by_day`.`the_year` = 2022 AND `[time]_time_by_day`.`quarter` < '01' ) OR ( `[time]_time_by_day`.`the_year` = 2022 AND `[time]_time_by_day`.`quarter` = '01' ) )")

    expect(
      compileSlicer(
        {
          dimension: {
            dimension: '[Time]'
          },
          operator: FilterOperator.BT,
          members: [
            {
              value: '[2019].[12]'
            },
            {
              value: '[2022].[01]'
            },
          ],
          exclude: true
        },
        {
          schema: CUBE_SALESORDER,
          entityType: ENTITY_TYPE_SALESORDER,
          factTable: 'sales_fact',
          dimensions: [],
          measures: []
        },
        ''
      )
    ).toEqual("NOT ( ( `[time]_time_by_day`.`the_year` > 2019 OR ( `[time]_time_by_day`.`the_year` = 2019 AND `[time]_time_by_day`.`quarter` > '12' ) OR ( `[time]_time_by_day`.`the_year` = 2019 AND `[time]_time_by_day`.`quarter` = '12' ) ) AND ( `[time]_time_by_day`.`the_year` < 2022 OR ( `[time]_time_by_day`.`the_year` = 2022 AND `[time]_time_by_day`.`quarter` < '01' ) OR ( `[time]_time_by_day`.`the_year` = 2022 AND `[time]_time_by_day`.`quarter` = '01' ) ) )")
  })

  it('Compile slicers with AllMember', () => {
    expect(compileFilters([
      {
        dimension: {
          dimension: '[Product]'
        },
        members: [
          {
            value: 'A1'
          },
          {
            value: 'A2'
          }
        ]
      },
      {
        dimension: {
          dimension: '[Time]'
        },
        members: [
          {
            value: '[(All)]'
          }
        ]
      }
    ], {
      schema: CUBE_SALESORDER,
      entityType: ENTITY_TYPE_SALESORDER,
      factTable: 'sales_fact',
      dimensions: [],
      measures: []
    },
    'pg')).toEqual(
      `( "[product]_product"."brand_name" = 'A1' ) OR ( "[product]_product"."brand_name" = 'A2' )`
    )
  })

  it('Compile combination slicers', () => {
    expect(
      compileFilters(
        [
          {
            children: [
              {
                dimension: {
                  dimension: '[Product]'
                },
                members: [
                  {
                    value: 'A1'
                  },
                  {
                    value: 'A2'
                  }
                ]
              },
              {
                dimension: {
                  dimension: '[Time]'
                },
                members: [
                  {
                    value: 2022
                  }
                ]
              }
            ],
            filteringLogic: FilteringLogic.And
          } as IAdvancedFilter
        ],
        {
          schema: CUBE_SALESORDER,
          entityType: ENTITY_TYPE_SALESORDER,
          factTable: 'sales_fact',
          dimensions: [],
          measures: []
        },
        'pg'
      )
    ).toEqual(
      `( ( "[product]_product"."brand_name" = 'A1' ) OR ( "[product]_product"."brand_name" = 'A2' ) ) AND ( "[time]_time_by_day"."the_year" = 2022 )`
    )

    expect(
      compileFilters(
        [
          {
            children: [
              {
                dimension: {
                  dimension: '[Product]'
                },
                members: [
                  {
                    value: 'A1'
                  },
                  {
                    value: 'A2'
                  }
                ]
              },
              {
                dimension: {
                  dimension: '[Time]'
                },
                operator: FilterOperator.GT,
                members: [
                  {
                    value: 2022
                  }
                ]
              }
            ],
            filteringLogic: FilteringLogic.And
          } as IAdvancedFilter
        ],
        {
          schema: CUBE_SALESORDER,
          entityType: ENTITY_TYPE_SALESORDER,
          factTable: 'sales_fact',
          dimensions: [],
          measures: []
        },
        'pg'
      )
    ).toEqual(
      `( ( "[product]_product"."brand_name" = 'A1' ) OR ( "[product]_product"."brand_name" = 'A2' ) ) AND ( "[time]_time_by_day"."the_year" > 2022 )`
    )
  })
})
