import { C_MEASURES } from '@metad/ocap-core'
import { buildCubeContext, compileCubeSchema, CubeContext } from './cube'
import { CUBE_SALESORDER, ENTITY_TYPE_SALESORDER, SCHEMA } from './mock-data'
import { queryCube, serializeCubeFact, serializeCubeFrom, transposePivot } from './query'

const CUBE_CONTEXT: CubeContext = {
  schema: CUBE_SALESORDER,
  entityType: ENTITY_TYPE_SALESORDER,
  factTable: `[sales]_salesorder`,
  dimensions: [],
  measures: []
}

describe('Serialize SQL', () => {
  beforeAll(() => {
    //
  })

  it('query Dimension from Schema', async () => {
    const { statement } = queryCube(CUBE_SALESORDER, { rows: [{ dimension: '[Time]' }] }, ENTITY_TYPE_SALESORDER, '')

    expect(statement).toEqual(
      "SELECT '(All)' AS `[Time]`, 'All' AS `[Time].[MEMBER_CAPTION]`, SUM( `salesorder_sales_fact`.`store_sales` ) AS `Sales` FROM `sales_fact` AS `salesorder_sales_fact` INNER JOIN `time_by_day` AS `[time]_time_by_day` ON `salesorder_sales_fact`.`time_id` = `[time]_time_by_day`.`time_id` GROUP BY 1"
    )
  })

  it('query Dimension and Measure from Schema', async () => {
    const { statement } = queryCube(
      CUBE_SALESORDER,
      {
        rows: [{ dimension: '[Time]' }],
        columns: [
          {
            dimension: C_MEASURES,
            measure: 'Sales'
          }
        ]
      },
      ENTITY_TYPE_SALESORDER,
      ''
    )

    expect(statement).toEqual(
      "SELECT '(All)' AS `[Time]`, 'All' AS `[Time].[MEMBER_CAPTION]`, SUM( `salesorder_sales_fact`.`store_sales` ) AS `Sales` FROM `sales_fact` AS `salesorder_sales_fact` INNER JOIN `time_by_day` AS `[time]_time_by_day` ON `salesorder_sales_fact`.`time_id` = `[time]_time_by_day`.`time_id` GROUP BY 1"
    )
  })

  it('query Hierarchy from Schema', async () => {
    const { statement } = queryCube(
      CUBE_SALESORDER,
      {
        rows: [
          {
            dimension: '[Time]',
            hierarchy: '[Time.Weekly]',
            level: '[Time.Weekly].[Year]'
          }
        ],
        columns: [
          {
            dimension: C_MEASURES,
            measure: 'Sales'
          }
        ]
      },
      ENTITY_TYPE_SALESORDER,
      ''
    )

    expect(statement).toEqual(
      "SELECT concat('[', CASE WHEN `[time.weekly]_time_by_day`.`the_year` IS NULL THEN '#' ELSE `[time.weekly]_time_by_day`.`the_year` END, ']') AS `[Time.Weekly]`, `[time.weekly]_time_by_day`.`the_year` AS `[Time.Weekly].[MEMBER_CAPTION]`, SUM( `salesorder_sales_fact`.`store_sales` ) AS `Sales` FROM `sales_fact` AS `salesorder_sales_fact` INNER JOIN `time_by_day` AS `[time.weekly]_time_by_day` ON `salesorder_sales_fact`.`time_id` = `[time.weekly]_time_by_day`.`time_id` GROUP BY `[time.weekly]_time_by_day`.`the_year` ORDER BY `[time.weekly]_time_by_day`.`the_year`"
    )
  })

  it('query Multi Levels from same Hierarchy', async () => {
    try {
      const { statement } = queryCube(
        CUBE_SALESORDER,
        {
          rows: [
            {
              dimension: '[Time]',
              hierarchy: '[Time.Weekly]',
              level: '[Time.Weekly].[Year]'
            },
            {
              dimension: '[Time]',
              hierarchy: '[Time.Weekly]',
              level: '[Time.Weekly].[Week]'
            }
          ],
          columns: [
            {
              dimension: C_MEASURES,
              measure: 'Sales'
            }
          ]
        },
        ENTITY_TYPE_SALESORDER,
        ''
      )
    } catch (error: any) {
      expect(error.message).toEqual('暂时不能同时查询不同层级')
    }
  })

  it('query Low Level from Hierarchy', async () => {
    const { statement } = queryCube(
      CUBE_SALESORDER,
      {
        rows: [
          {
            dimension: '[Time]',
            hierarchy: '[Time.Weekly]',
            level: '[Time.Weekly].[Week]'
          }
        ],
        columns: [
          {
            dimension: C_MEASURES,
            measure: 'Sales'
          }
        ]
      },
      ENTITY_TYPE_SALESORDER,
      ''
    )

    expect(statement).toEqual(
      "SELECT concat('[', CASE WHEN `[time.weekly]_time_by_day`.`the_year` IS NULL THEN '#' ELSE `[time.weekly]_time_by_day`.`the_year` END,'].[',CASE WHEN `[time.weekly]_time_by_day`.`week_of_year` IS NULL THEN '#' ELSE `[time.weekly]_time_by_day`.`week_of_year` END, ']') AS `[Time.Weekly]`, `[time.weekly]_time_by_day`.`week_of_year` AS `[Time.Weekly].[MEMBER_CAPTION]`, SUM( `salesorder_sales_fact`.`store_sales` ) AS `Sales` FROM `sales_fact` AS `salesorder_sales_fact` INNER JOIN `time_by_day` AS `[time.weekly]_time_by_day` ON `salesorder_sales_fact`.`time_id` = `[time.weekly]_time_by_day`.`time_id` GROUP BY `[time.weekly]_time_by_day`.`the_year`, `[time.weekly]_time_by_day`.`week_of_year` ORDER BY `[time.weekly]_time_by_day`.`the_year`, `[time.weekly]_time_by_day`.`week_of_year`"
    )
  })

  it('Query Degenerate dimension', () => {
    const { statement } = queryCube(
      SCHEMA,
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
            measure: 'Sales'
          }
        ]
      },
      ENTITY_TYPE_SALESORDER,
      ''
    )

    expect(statement).toEqual(
      "SELECT concat('[', CASE WHEN `salesorder_sales_fact`.`payment_method` IS NULL THEN '#' ELSE `salesorder_sales_fact`.`payment_method` END, ']') AS `[Payment method]`, `salesorder_sales_fact`.`payment_method` AS `[Payment method].[MEMBER_CAPTION]`, SUM( `salesorder_sales_fact`.`store_sales` ) AS `Sales` FROM `sales_fact` AS `salesorder_sales_fact` GROUP BY `salesorder_sales_fact`.`payment_method` ORDER BY `salesorder_sales_fact`.`payment_method`"
    )
  })
})

describe('Build Cube', () => {
  it('Build Cube Context', () => {
    const cubeContext = buildCubeContext(
      CUBE_SALESORDER,
      {
        rows: [
          {
            dimension: '[Time]',
            hierarchy: '[Time.Weekly]',
            level: '[Time.Weekly].[Year]'
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
            column: 'the_year',
            table: '[time.weekly]_time_by_day',
            cast: 'VARCHAR'
          }
        ]
      },
      {
        alias: '[Time.Weekly].[MEMBER_CAPTION]',
        column: 'the_year',
        table: '[time.weekly]_time_by_day'
      }
    ])
  })

  it('serializeCubeFrom', () => {
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
    const statement = serializeCubeFrom(cubeContext, '')
    expect(statement).toEqual(
      '`sales_fact` AS `salesorder_sales_fact` INNER JOIN `time_by_day` AS `[time.weekly]_time_by_day` ON `salesorder_sales_fact`.`time_id` = `[time.weekly]_time_by_day`.`time_id`'
    )
  })

  it('queryCube', () => {
    const { statement } = queryCube(
      SCHEMA,
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

    expect(statement).toEqual(
      "SELECT concat('[', CASE WHEN `[time.weekly]_time_by_day`.`the_year` IS NULL THEN '#' ELSE `[time.weekly]_time_by_day`.`the_year` END,'].[',CASE WHEN `[time.weekly]_time_by_day`.`week_of_year` IS NULL THEN '#' ELSE `[time.weekly]_time_by_day`.`week_of_year` END, ']') AS `[Time.Weekly]`, `[time.weekly]_time_by_day`.`week_of_year` AS `[Time.Weekly].[MEMBER_CAPTION]`, SUM( `salesorder_sales_fact`.`store_sales` ) AS `Sales` FROM `sales_fact` AS `salesorder_sales_fact` INNER JOIN `time_by_day` AS `[time.weekly]_time_by_day` ON `salesorder_sales_fact`.`time_id` = `[time.weekly]_time_by_day`.`time_id` GROUP BY `[time.weekly]_time_by_day`.`the_year`, `[time.weekly]_time_by_day`.`week_of_year` ORDER BY `[time.weekly]_time_by_day`.`the_year`, `[time.weekly]_time_by_day`.`week_of_year`"
    )
  })

  it('queryCube with Calculated Member', () => {
    const { statement } = queryCube(
      SCHEMA,
      {
        rows: [
          {
            dimension: '[Time]',
            hierarchy: '[Time.Weekly]',
            level: '[Time.Weekly].[Week]'
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

    expect(statement).toEqual(
      "SELECT concat('[', CASE WHEN `[time.weekly]_time_by_day`.`the_year` IS NULL THEN '#' ELSE `[time.weekly]_time_by_day`.`the_year` END,'].[',CASE WHEN `[time.weekly]_time_by_day`.`week_of_year` IS NULL THEN '#' ELSE `[time.weekly]_time_by_day`.`week_of_year` END, ']') AS `[Time.Weekly]`, `[time.weekly]_time_by_day`.`week_of_year` AS `[Time.Weekly].[MEMBER_CAPTION]`, SUM( `sales_fact`.`store_sales` - `sales_fact`.`store_cost` ) AS `Profit` FROM `sales_fact` AS `salesorder_sales_fact` INNER JOIN `time_by_day` AS `[time.weekly]_time_by_day` ON `salesorder_sales_fact`.`time_id` = `[time.weekly]_time_by_day`.`time_id` GROUP BY `[time.weekly]_time_by_day`.`the_year`, `[time.weekly]_time_by_day`.`week_of_year` ORDER BY `[time.weekly]_time_by_day`.`the_year`, `[time.weekly]_time_by_day`.`week_of_year`"
    )
  })

  it('queryCube with All dimension and Measures', () => {
    const { statement } = queryCube(
      SCHEMA,
      {
        rows: [
          {
            dimension: '[Time]',
            hierarchy: '[Time.Weekly]',
            level: '[Time.Weekly].[Week]'
          },
          {
            dimension: '[Product]',
            hierarchy: '[Product]',
            level: '[Product].[Brand Name]'
          },
          {
            dimension: '[Payment method]',
            hierarchy: '[Payment method]',
            level: '[Payment method].[Payment method]'
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
          },
          {
            dimension: C_MEASURES,
            measure: 'Profit'
          }
        ]
      },
      ENTITY_TYPE_SALESORDER,
      ''
    )

    expect(statement).toEqual(
      "SELECT concat('[', CASE WHEN `[time.weekly]_time_by_day`.`the_year` IS NULL THEN '#' ELSE `[time.weekly]_time_by_day`.`the_year` END,'].[',CASE WHEN `[time.weekly]_time_by_day`.`week_of_year` IS NULL THEN '#' ELSE `[time.weekly]_time_by_day`.`week_of_year` END, ']') AS `[Time.Weekly]`, `[time.weekly]_time_by_day`.`week_of_year` AS `[Time.Weekly].[MEMBER_CAPTION]`, concat('[', CASE WHEN `[product]_product`.`brand_name` IS NULL THEN '#' ELSE `[product]_product`.`brand_name` END, ']') AS `[Product]`, `[product]_product`.`brand_name` AS `[Product].[MEMBER_CAPTION]`, concat('[', CASE WHEN `salesorder_sales_fact`.`payment_method` IS NULL THEN '#' ELSE `salesorder_sales_fact`.`payment_method` END, ']') AS `[Payment method]`, `salesorder_sales_fact`.`payment_method` AS `[Payment method].[MEMBER_CAPTION]`, SUM( `salesorder_sales_fact`.`store_sales` ) AS `Sales`, SUM( `salesorder_sales_fact`.`store_cost` ) AS `Cost`, SUM( `sales_fact`.`store_sales` - `sales_fact`.`store_cost` ) AS `Profit` FROM `sales_fact` AS `salesorder_sales_fact` INNER JOIN `time_by_day` AS `[time.weekly]_time_by_day` ON `salesorder_sales_fact`.`time_id` = `[time.weekly]_time_by_day`.`time_id` INNER JOIN `product` AS `[product]_product` ON `salesorder_sales_fact`.`product_id` = `[product]_product`.`product_id` GROUP BY `[time.weekly]_time_by_day`.`the_year`, `[time.weekly]_time_by_day`.`week_of_year`, `[product]_product`.`brand_name`, `salesorder_sales_fact`.`payment_method` ORDER BY `[time.weekly]_time_by_day`.`the_year`, `[time.weekly]_time_by_day`.`week_of_year`, `[product]_product`.`brand_name`, `salesorder_sales_fact`.`payment_method`"
    )
  })

  it('queryCube with Two dimensions has same table', () => {
    const { statement } = queryCube(
      SCHEMA,
      {
        rows: [
          {
            dimension: '[Product]'
          },
          {
            dimension: '[Product Class]'
          }
        ],
        columns: [
          {
            dimension: C_MEASURES,
            measure: 'Sales'
          }
        ]
      },
      ENTITY_TYPE_SALESORDER,
      ''
    )

    expect(statement).toEqual(
      "SELECT '(All)' AS `[Product]`, 'All' AS `[Product].[MEMBER_CAPTION]`, concat('[', CASE WHEN `[product_class]_product_type`.`product_type_id` IS NULL THEN '#' ELSE `[product_class]_product_type`.`product_type_id` END, ']') AS `[Product Class]`, `[product_class]_product_type`.`product_type_id` AS `[Product Class].[MEMBER_CAPTION]`, SUM( `salesorder_sales_fact`.`store_sales` ) AS `Sales` FROM `sales_fact` AS `salesorder_sales_fact` INNER JOIN `product` AS `[product]_product` ON `salesorder_sales_fact`.`product_id` = `[product]_product`.`product_id` INNER JOIN (`product` AS `[product_class]_product` Left JOIN `product_class` AS `[product_class]_product_class` ON `[product_class]_product`.`product_class_id` = `[product_class]_product_class`.`product_class_id` Left JOIN `product_type` AS `[product_class]_product_type` ON `[product_class]_product_class`.`product_type_id` = `[product_class]_product_type`.`product_type_id`) ON `salesorder_sales_fact`.`product_id` = `[product_class]_product`.`product_id` GROUP BY `[product_class]_product_type`.`product_type_id` ORDER BY `[product_class]_product_type`.`product_type_id`"
    )
  })
})

describe('Query Cube with Filters', () => {
  it('Build Cube Context with Filters', () => {
    const cubeContext = buildCubeContext(
      CUBE_SALESORDER,
      {
        rows: [
          {
            dimension: '[Time]',
            hierarchy: '[Time.Weekly]',
            level: '[Time.Weekly].[Year]'
          }
        ],
        filters: [
          {
            dimension: {
              dimension: '[Product]'
            },
            members: [
              {
                key: '[Brand 1].[Product 1]'
              }
            ]
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
            column: 'the_year',
            table: '[time.weekly]_time_by_day',
            cast: 'VARCHAR'
          }
        ]
      },
      {
        alias: '[Time.Weekly].[MEMBER_CAPTION]',
        column: 'the_year',
        table: '[time.weekly]_time_by_day'
      }
    ])
  })

  it('Build Cube Context with Filters', () => {
    const { statement } = queryCube(
      SCHEMA,
      {
        rows: [
          {
            dimension: '[Time]',
            hierarchy: '[Time.Weekly]',
            level: '[Time.Weekly].[Year]'
          }
        ],
        filters: [
          {
            dimension: {
              dimension: '[Product]'
            },
            members: [
              {
                key: '[Brand 1].[Product 1]'
              }
            ]
          }
        ]
      },
      ENTITY_TYPE_SALESORDER,
      ''
    )
    expect(statement).toEqual(
      "SELECT concat('[', CASE WHEN `[time.weekly]_time_by_day`.`the_year` IS NULL THEN '#' ELSE `[time.weekly]_time_by_day`.`the_year` END, ']') AS `[Time.Weekly]`, `[time.weekly]_time_by_day`.`the_year` AS `[Time.Weekly].[MEMBER_CAPTION]`, SUM( `salesorder_sales_fact`.`store_sales` ) AS `Sales` FROM `sales_fact` AS `salesorder_sales_fact` INNER JOIN `time_by_day` AS `[time.weekly]_time_by_day` ON `salesorder_sales_fact`.`time_id` = `[time.weekly]_time_by_day`.`time_id` INNER JOIN `product` AS `[product]_product` ON `salesorder_sales_fact`.`product_id` = `[product]_product`.`product_id` WHERE `[product]_product`.`brand_name` = 'Brand 1' AND `[product]_product`.`product_name` = 'Product 1' GROUP BY `[time.weekly]_time_by_day`.`the_year` ORDER BY `[time.weekly]_time_by_day`.`the_year`"
    )
  })
})

describe('Hive DB', () => {
  it('serializeCubeFact', () => {
    expect(
      serializeCubeFact(
        {
          name: 'Sales',
          fact: {
            type: 'table',
            table: { name: 'SalesOrder' }
          },
          defaultMeasure: ''
        },
        'hive'
      )
    ).toEqual('SELECT * FROM `SalesOrder`')
  })

  it('serializeCubeFact with view', () => {
    expect(
      serializeCubeFact(
        {
          name: 'Sales',
          fact: {
            type: 'view',
            view: {
              alias: 'SalesView',
              sql: { content: 'SELECT * FROM SalesOrder' }
            }
          },
          defaultMeasure: ''
        },
        'hive'
      )
    ).toEqual('SELECT * FROM (SELECT * FROM SalesOrder) AS `SalesView`')
  })

  it('serializeCubeFact with tables', () => {
    expect(
      serializeCubeFact(
        {
          name: 'Sales',
          fact: {
            type: 'tables',
            tables: [
              {
                name: 'fact_a'
              },
              {
                name: 'fact_b',
                join: {
                  type: 'Left',
                  fields: [{ leftKey: 'id', rightKey: 'a_id' }]
                }
              },
              {
                name: 'fact_c',
                join: {
                  type: 'Inner',
                  leftTable: 'fact_a',
                  fields: [{ leftKey: 'id', rightKey: 'a_id' }]
                }
              }
            ]
          },
          defaultMeasure: ''
        },
        'hive'
      )
    ).toEqual(
      'SELECT * FROM `fact_a` Left JOIN `fact_b` AS `fact_b` ON `fact_a`.`id` = `fact_b`.`a_id` Inner JOIN `fact_c` AS `fact_c` ON `fact_a`.`id` = `fact_c`.`a_id`'
    )
  })

  it('queryCube with Hive', () => {
    const { statement } = queryCube(
      SCHEMA,
      {
        rows: [
          {
            dimension: '[time]',
            hierarchy: '[time|weekly]',
            level: '[time|weekly][week]'
          },
          {
            dimension: '[product]',
            hierarchy: '[product]',
            level: '[product][brand name]'
          },
          {
            dimension: '[payment method]',
            hierarchy: '[payment method]',
            level: '[payment method][payment method]'
          }
        ],
        columns: [
          {
            dimension: C_MEASURES,
            measure: 'sales'
          },
          {
            dimension: C_MEASURES,
            measure: 'cost'
          },
          {
            dimension: C_MEASURES,
            measure: 'profit'
          }
        ]
      },
      compileCubeSchema(CUBE_SALESORDER.name, CUBE_SALESORDER, SCHEMA.dimensions, 'hive'),
      'hive',
      'foodmart'
    )

    expect(statement).toEqual(
      "SELECT concat('[', CASE WHEN `[time|weekly]_time_by_day`.`the_year` IS NULL THEN '#' ELSE `[time|weekly]_time_by_day`.`the_year` END,'].[',CASE WHEN `[time|weekly]_time_by_day`.`week_of_year` IS NULL THEN '#' ELSE `[time|weekly]_time_by_day`.`week_of_year` END, ']') AS `[time|weekly]`, `[time|weekly]_time_by_day`.`week_of_year` AS `[time|weekly][member_caption]`, concat('[', CASE WHEN `[product]_product`.`brand_name` IS NULL THEN '#' ELSE `[product]_product`.`brand_name` END, ']') AS `[product]`, `[product]_product`.`brand_name` AS `[product][member_caption]`, concat('[', CASE WHEN `salesorder_sales_fact`.`payment_method` IS NULL THEN '#' ELSE `salesorder_sales_fact`.`payment_method` END, ']') AS `[payment method]`, `salesorder_sales_fact`.`payment_method` AS `[payment method][member_caption]`, SUM( `salesorder_sales_fact`.`store_sales` ) AS `sales`, SUM( `salesorder_sales_fact`.`store_cost` ) AS `cost`, SUM( `sales_fact`.`store_sales` - `sales_fact`.`store_cost` ) AS `profit` FROM `foodmart`.`sales_fact` AS `salesorder_sales_fact` INNER JOIN `foodmart`.`time_by_day` AS `[time|weekly]_time_by_day` ON `salesorder_sales_fact`.`time_id` = `[time|weekly]_time_by_day`.`time_id` INNER JOIN `foodmart`.`product` AS `[product]_product` ON `salesorder_sales_fact`.`product_id` = `[product]_product`.`product_id` GROUP BY `[time|weekly]_time_by_day`.`the_year`, `[time|weekly]_time_by_day`.`week_of_year`, `[product]_product`.`brand_name`, `salesorder_sales_fact`.`payment_method` ORDER BY `[time|weekly]_time_by_day`.`the_year`, `[time|weekly]_time_by_day`.`week_of_year`, `[product]_product`.`brand_name`, `salesorder_sales_fact`.`payment_method`"
    )
  })
})

// ====================================== Dimension display as hierarchy ======================================
describe('Dimension display as hierarchy', () => {
  it('Basic', () => {
    const { statement } = queryCube(
      CUBE_SALESORDER,
      {
        rows: [
          {
            dimension: '[Time]',
            level: '[Time].[Year]',
            displayHierarchy: true
          }
        ],
        columns: []
      },
      ENTITY_TYPE_SALESORDER,
      ''
    )

    expect(statement).toEqual(
      "(SELECT '(All)' AS `[Time]`, 'All' AS `[Time].[MEMBER_CAPTION]`, '' AS `[Time].[PARENT_UNIQUE_NAME]`, COUNT(DISTINCT concat('[', CASE WHEN `[time]_time_by_day`.`the_year` IS NULL THEN '#' ELSE `[time]_time_by_day`.`the_year` END, ']')) AS `[Time].[CHILDREN_CARDINALITY]`, SUM( `salesorder_sales_fact`.`store_sales` ) AS `Sales` FROM `sales_fact` AS `salesorder_sales_fact` INNER JOIN `time_by_day` AS `[time]_time_by_day` ON `salesorder_sales_fact`.`time_id` = `[time]_time_by_day`.`time_id` GROUP BY 1) union (SELECT concat('[', CASE WHEN `[time]_time_by_day`.`the_year` IS NULL THEN '#' ELSE `[time]_time_by_day`.`the_year` END, ']') AS `[Time]`, `[time]_time_by_day`.`the_year` AS `[Time].[MEMBER_CAPTION]`, '(All)' AS `[Time].[PARENT_UNIQUE_NAME]`, COUNT(DISTINCT concat('[', CASE WHEN `[time]_time_by_day`.`the_year` IS NULL THEN '#' ELSE `[time]_time_by_day`.`the_year` END,'].[',CASE WHEN `[time]_time_by_day`.`quarter` IS NULL THEN '#' ELSE `[time]_time_by_day`.`quarter` END, ']')) AS `[Time].[CHILDREN_CARDINALITY]`, SUM( `salesorder_sales_fact`.`store_sales` ) AS `Sales` FROM `sales_fact` AS `salesorder_sales_fact` INNER JOIN `time_by_day` AS `[time]_time_by_day` ON `salesorder_sales_fact`.`time_id` = `[time]_time_by_day`.`time_id` GROUP BY `[time]_time_by_day`.`the_year` ORDER BY `[time]_time_by_day`.`the_year`)"
    )
  })

  it('Two dimensions with displayHierarchy', () => {
    const { statement } = queryCube(
      CUBE_SALESORDER,
      {
        rows: [
          {
            dimension: '[Time]',
            level: '[Time].[Year]',
            displayHierarchy: true
          },
          {
            dimension: '[Product]',
            level: '[Product].[Brand Name]',
            displayHierarchy: true
          }
        ],
        columns: []
      },
      ENTITY_TYPE_SALESORDER,
      ''
    )

    expect(statement).toEqual(
      "(SELECT '(All)' AS `[Time]`, 'All' AS `[Time].[MEMBER_CAPTION]`, '' AS `[Time].[PARENT_UNIQUE_NAME]`, COUNT(DISTINCT concat('[', CASE WHEN `[time]_time_by_day`.`the_year` IS NULL THEN '#' ELSE `[time]_time_by_day`.`the_year` END, ']')) AS `[Time].[CHILDREN_CARDINALITY]`, '(All)' AS `[Product]`, 'All' AS `[Product].[MEMBER_CAPTION]`, '' AS `[Product].[PARENT_UNIQUE_NAME]`, COUNT(DISTINCT concat('[', CASE WHEN `[product]_product`.`brand_name` IS NULL THEN '#' ELSE `[product]_product`.`brand_name` END, ']')) AS `[Product].[CHILDREN_CARDINALITY]`, SUM( `salesorder_sales_fact`.`store_sales` ) AS `Sales` FROM `sales_fact` AS `salesorder_sales_fact` INNER JOIN `time_by_day` AS `[time]_time_by_day` ON `salesorder_sales_fact`.`time_id` = `[time]_time_by_day`.`time_id` INNER JOIN `product` AS `[product]_product` ON `salesorder_sales_fact`.`product_id` = `[product]_product`.`product_id` GROUP BY 1) union (SELECT concat('[', CASE WHEN `[time]_time_by_day`.`the_year` IS NULL THEN '#' ELSE `[time]_time_by_day`.`the_year` END, ']') AS `[Time]`, `[time]_time_by_day`.`the_year` AS `[Time].[MEMBER_CAPTION]`, '(All)' AS `[Time].[PARENT_UNIQUE_NAME]`, COUNT(DISTINCT concat('[', CASE WHEN `[time]_time_by_day`.`the_year` IS NULL THEN '#' ELSE `[time]_time_by_day`.`the_year` END,'].[',CASE WHEN `[time]_time_by_day`.`quarter` IS NULL THEN '#' ELSE `[time]_time_by_day`.`quarter` END, ']')) AS `[Time].[CHILDREN_CARDINALITY]`, '(All)' AS `[Product]`, 'All' AS `[Product].[MEMBER_CAPTION]`, '' AS `[Product].[PARENT_UNIQUE_NAME]`, COUNT(DISTINCT concat('[', CASE WHEN `[product]_product`.`brand_name` IS NULL THEN '#' ELSE `[product]_product`.`brand_name` END, ']')) AS `[Product].[CHILDREN_CARDINALITY]`, SUM( `salesorder_sales_fact`.`store_sales` ) AS `Sales` FROM `sales_fact` AS `salesorder_sales_fact` INNER JOIN `time_by_day` AS `[time]_time_by_day` ON `salesorder_sales_fact`.`time_id` = `[time]_time_by_day`.`time_id` INNER JOIN `product` AS `[product]_product` ON `salesorder_sales_fact`.`product_id` = `[product]_product`.`product_id` GROUP BY `[time]_time_by_day`.`the_year` ORDER BY `[time]_time_by_day`.`the_year`) union (SELECT '(All)' AS `[Time]`, 'All' AS `[Time].[MEMBER_CAPTION]`, '' AS `[Time].[PARENT_UNIQUE_NAME]`, COUNT(DISTINCT concat('[', CASE WHEN `[time]_time_by_day`.`the_year` IS NULL THEN '#' ELSE `[time]_time_by_day`.`the_year` END, ']')) AS `[Time].[CHILDREN_CARDINALITY]`, concat('[', CASE WHEN `[product]_product`.`brand_name` IS NULL THEN '#' ELSE `[product]_product`.`brand_name` END, ']') AS `[Product]`, `[product]_product`.`brand_name` AS `[Product].[MEMBER_CAPTION]`, '(All)' AS `[Product].[PARENT_UNIQUE_NAME]`, COUNT(DISTINCT concat('[', CASE WHEN `[product]_product`.`brand_name` IS NULL THEN '#' ELSE `[product]_product`.`brand_name` END,'].[',CASE WHEN `[product]_product`.`product_name` IS NULL THEN '#' ELSE `[product]_product`.`product_name` END, ']')) AS `[Product].[CHILDREN_CARDINALITY]`, SUM( `salesorder_sales_fact`.`store_sales` ) AS `Sales` FROM `sales_fact` AS `salesorder_sales_fact` INNER JOIN `time_by_day` AS `[time]_time_by_day` ON `salesorder_sales_fact`.`time_id` = `[time]_time_by_day`.`time_id` INNER JOIN `product` AS `[product]_product` ON `salesorder_sales_fact`.`product_id` = `[product]_product`.`product_id` GROUP BY `[product]_product`.`brand_name` ORDER BY `[product]_product`.`brand_name`) union (SELECT concat('[', CASE WHEN `[time]_time_by_day`.`the_year` IS NULL THEN '#' ELSE `[time]_time_by_day`.`the_year` END, ']') AS `[Time]`, `[time]_time_by_day`.`the_year` AS `[Time].[MEMBER_CAPTION]`, '(All)' AS `[Time].[PARENT_UNIQUE_NAME]`, COUNT(DISTINCT concat('[', CASE WHEN `[time]_time_by_day`.`the_year` IS NULL THEN '#' ELSE `[time]_time_by_day`.`the_year` END,'].[',CASE WHEN `[time]_time_by_day`.`quarter` IS NULL THEN '#' ELSE `[time]_time_by_day`.`quarter` END, ']')) AS `[Time].[CHILDREN_CARDINALITY]`, concat('[', CASE WHEN `[product]_product`.`brand_name` IS NULL THEN '#' ELSE `[product]_product`.`brand_name` END, ']') AS `[Product]`, `[product]_product`.`brand_name` AS `[Product].[MEMBER_CAPTION]`, '(All)' AS `[Product].[PARENT_UNIQUE_NAME]`, COUNT(DISTINCT concat('[', CASE WHEN `[product]_product`.`brand_name` IS NULL THEN '#' ELSE `[product]_product`.`brand_name` END,'].[',CASE WHEN `[product]_product`.`product_name` IS NULL THEN '#' ELSE `[product]_product`.`product_name` END, ']')) AS `[Product].[CHILDREN_CARDINALITY]`, SUM( `salesorder_sales_fact`.`store_sales` ) AS `Sales` FROM `sales_fact` AS `salesorder_sales_fact` INNER JOIN `time_by_day` AS `[time]_time_by_day` ON `salesorder_sales_fact`.`time_id` = `[time]_time_by_day`.`time_id` INNER JOIN `product` AS `[product]_product` ON `salesorder_sales_fact`.`product_id` = `[product]_product`.`product_id` GROUP BY `[time]_time_by_day`.`the_year`, `[product]_product`.`brand_name` ORDER BY `[time]_time_by_day`.`the_year`, `[product]_product`.`brand_name`)"
    )
  })
})

describe('Transpose Pivot result', () => {
  it('Basic', () => {
    const { data, schema } = transposePivot(CUBE_CONTEXT, [])

    expect(schema).toEqual({ recursiveHierarchy: undefined, rowHierarchy: undefined })
  })
})

describe('Indicators', () => {
  beforeAll(() => {
    //
  })

  it('query indicator', async () => {
    const { statement } = queryCube(
      CUBE_SALESORDER,
      {
        rows: [
          {
            dimension: '[Time]',
            level: '[Time].[Year]'
          }
        ],
        columns: [
          {
            dimension: C_MEASURES,
            measure: 'I1'
          },
          {
            dimension: C_MEASURES,
            measure: 'I4'
          }
        ]
      },
      ENTITY_TYPE_SALESORDER,
      'pg'
    )

    expect(statement).toEqual(
      `SELECT concat('[', CASE WHEN "[time]_time_by_day"."the_year" IS NULL THEN '#' ELSE CAST("[time]_time_by_day"."the_year" AS VARCHAR) END, ']') AS "[Time]", "[time]_time_by_day"."the_year" AS "[Time].[MEMBER_CAPTION]", SUM( CASE WHEN ( ( "[product]_product"."brand_name" = 'Excel' AND "[product]_product"."product_name" = 'Excel Monthly Auto Magazine' ) OR ( "[product]_product"."brand_name" = 'CDR' ) ) AND ( "[customer]_customer"."country" = 'USA' AND "[customer]_customer"."city" = 'San Francisco' ) THEN "salesorder_sales_fact"."store_sales" ELSE NULL END ) AS "I1", SUM( CASE WHEN ( ( "[product]_product"."brand_name" = 'Excel' AND "[product]_product"."product_name" = 'Excel Monthly Auto Magazine' ) OR ( "[product]_product"."brand_name" = 'CDR' ) ) AND ( NOT ( "[customer]_customer"."country" = 'USA' ) ) THEN "salesorder_sales_fact"."store_sales" - "salesorder_sales_fact"."store_cost" ELSE NULL END ) / SUM( CASE WHEN ( ( "[product]_product"."brand_name" = 'Excel' AND "[product]_product"."product_name" = 'Excel Monthly Auto Magazine' ) OR ( "[product]_product"."brand_name" = 'CDR' ) ) AND ( "[customer]_customer"."country" = 'USA' AND "[customer]_customer"."city" = 'San Francisco' ) THEN "salesorder_sales_fact"."store_sales" ELSE NULL END ) AS "I4" FROM "sales_fact" AS "salesorder_sales_fact" INNER JOIN "time_by_day" AS "[time]_time_by_day" ON "salesorder_sales_fact"."time_id" = "[time]_time_by_day"."time_id" INNER JOIN "product" AS "[product]_product" ON "salesorder_sales_fact"."product_id" = "[product]_product"."product_id" INNER JOIN "customer" AS "[customer]_customer" ON "salesorder_sales_fact"."customer_id" = "[customer]_customer"."customer_id" GROUP BY "[time]_time_by_day"."the_year" ORDER BY "[time]_time_by_day"."the_year"`
    )
  })

  it('query indicator with combination slicer', async () => {
    const { statement } = queryCube(
      SCHEMA,
      {
        rows: [
          {
            dimension: '[Time]',
            level: '[Time].[Year]'
          }
        ],
        columns: [
          {
            dimension: C_MEASURES,
            measure: 'IwithCombinationSlicer'
          }
        ]
      },
      ENTITY_TYPE_SALESORDER,
      'pg'
    )

    expect(statement).toEqual(
      `SELECT concat('[', CASE WHEN "[time]_time_by_day"."the_year" IS NULL THEN '#' ELSE CAST("[time]_time_by_day"."the_year" AS VARCHAR) END, ']') AS "[Time]", "[time]_time_by_day"."the_year" AS "[Time].[MEMBER_CAPTION]", SUM( CASE WHEN ( ( "[product]_product"."brand_name" = 'Excel' AND "[product]_product"."product_name" = 'Excel Monthly Auto Magazine' ) OR ( "[product]_product"."brand_name" = 'CDR' ) ) AND ( ( "[customer]_customer"."country" = 'USA' ) AND ( NOT ( "[customer]_customer"."country" = 'USA' AND "[customer]_customer"."city" = 'San Francisco' ) ) ) THEN "salesorder_sales_fact"."store_sales" ELSE NULL END ) AS "IwithCombinationSlicer" FROM "sales_fact" AS "salesorder_sales_fact" INNER JOIN "time_by_day" AS "[time]_time_by_day" ON "salesorder_sales_fact"."time_id" = "[time]_time_by_day"."time_id" INNER JOIN "product" AS "[product]_product" ON "salesorder_sales_fact"."product_id" = "[product]_product"."product_id" INNER JOIN "customer" AS "[customer]_customer" ON "salesorder_sales_fact"."customer_id" = "[customer]_customer"."customer_id" GROUP BY "[time]_time_by_day"."the_year" ORDER BY "[time]_time_by_day"."the_year"`
    )
  })

  it('query indicator with AllMember', async () => {
    const { statement } = queryCube(
      SCHEMA,
      {
        rows: [
          {
            dimension: '[Time]',
            level: '[Time].[Year]'
          }
        ],
        columns: [
          {
            dimension: C_MEASURES,
            measure: 'IwithAllMember'
          }
        ]
      },
      ENTITY_TYPE_SALESORDER,
      'pg'
    )

    expect(statement).toEqual(
      `SELECT concat('[', CASE WHEN "[time]_time_by_day"."the_year" IS NULL THEN '#' ELSE CAST("[time]_time_by_day"."the_year" AS VARCHAR) END, ']') AS "[Time]", "[time]_time_by_day"."the_year" AS "[Time].[MEMBER_CAPTION]", SUM( CASE WHEN ( "[product]_product"."brand_name" = 'Excel' AND "[product]_product"."product_name" = 'Excel Monthly Auto Magazine' ) OR ( "[product]_product"."brand_name" = 'CDR' ) THEN "salesorder_sales_fact"."store_sales" ELSE NULL END ) AS "IwithAllMember" FROM "sales_fact" AS "salesorder_sales_fact" INNER JOIN "time_by_day" AS "[time]_time_by_day" ON "salesorder_sales_fact"."time_id" = "[time]_time_by_day"."time_id" INNER JOIN "product" AS "[product]_product" ON "salesorder_sales_fact"."product_id" = "[product]_product"."product_id" INNER JOIN "customer" AS "[customer]_customer" ON "salesorder_sales_fact"."customer_id" = "[customer]_customer"."customer_id" GROUP BY "[time]_time_by_day"."the_year" ORDER BY "[time]_time_by_day"."the_year"`
    )
  })
})
