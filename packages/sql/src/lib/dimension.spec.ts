import { AggregationRole, C_MEASURES, serializeUniqueName } from '@xpert-ai/ocap-core'
import {
  buildDimensionContext,
  compileDimensionSchema,
  DimensionContext,
  DimensionMembers,
  LevelCaptionField,
  LevelMembers,
  queryDimension
} from './dimension'
import {
  CUBE_SALESORDER,
  EMPLOYEE_DIMENSION,
  ENTITY_TYPE_SALESORDER,
  PRODUCT_DIMENSION,
  SHARED_DIMENSION_CUSTOMER
} from './mock-data'
import { C_MEASURES_ROW_COUNT } from './types'

const ENTITY_TYPE = {
  name: 'SalesOrder',
  properties: {
    [serializeUniqueName(PRODUCT_DIMENSION.name)]: compileDimensionSchema(PRODUCT_DIMENSION.name, PRODUCT_DIMENSION),
    [serializeUniqueName(EMPLOYEE_DIMENSION.name)]: compileDimensionSchema(EMPLOYEE_DIMENSION.name, EMPLOYEE_DIMENSION),
    '[Payment method]': {
      name: '[Payment method]',
      role: AggregationRole.dimension,
      hierarchies: [
        {
          name: '[Payment method]',
          hasAll: true,
          levels: [
            {
              name: '[Payment method].[Payment method]',
              column: 'payment_method',
              uniqueMembers: true
            }
          ]
        }
      ]
    }
  }
}

describe('Query Dimension', () => {
  it('#buildDimensionContext', () => {
    const context = buildDimensionContext(
      {
        selectFields: []
      } as DimensionContext,
      ENTITY_TYPE_SALESORDER,
      {
        dimension: '[Product]',
        level: '[Product].[Product]',
        properties: ['[Product].[SKU]']
      },
      'pg'
    )

    expect(context.selectFields).toEqual([
      {
        table: '[product]_product',
        columns: [
          { table: '[product]_product', column: 'brand_name' },
          { table: '[product]_product', column: 'product_name' }
        ],
        alias: '[Product].[Product]'
      },
      {
        table: '[product]_product',
        column: 'product_name',
        alias: '[Product].[Product].[MEMBER_CAPTION]'
      },
      {
        table: '[product]_product',
        column: 'SKU',
        alias: '[Product].[SKU]'
      }
    ])
  })

  it('Query Dimension', () => {
    expect(
      queryDimension(PRODUCT_DIMENSION, ENTITY_TYPE, {
        rows: [
          {
            dimension: '[Product]',
            level: '[Product].[Product Type]'
          },
          {
            dimension: '[Product]',
            level: '[Product].[Product Class]'
          },
          {
            dimension: '[Product]',
            level: '[Product].[Product]'
          }
        ]
      })
    ).toEqual(
      "SELECT concat('[', CASE WHEN `[product]_product_type`.`product_type_id` IS NULL THEN '#' ELSE `[product]_product_type`.`product_type_id` END, ']') AS `[Product].[Product Type]`, `[product]_product_type`.`product_type_id` AS `[Product].[Product Type].[MEMBER_CAPTION]`, concat('[', CASE WHEN `[product]_product_type`.`product_type_id` IS NULL THEN '#' ELSE `[product]_product_type`.`product_type_id` END,'].[',CASE WHEN `[product]_product_class`.`product_class_id` IS NULL THEN '#' ELSE `[product]_product_class`.`product_class_id` END, ']') AS `[Product].[Product Class]`, `[product]_product_class`.`product_class_id` AS `[Product].[Product Class].[MEMBER_CAPTION]`, concat('[', CASE WHEN `[product]_product_type`.`product_type_id` IS NULL THEN '#' ELSE `[product]_product_type`.`product_type_id` END,'].[',CASE WHEN `[product]_product_class`.`product_class_id` IS NULL THEN '#' ELSE `[product]_product_class`.`product_class_id` END,'].[',CASE WHEN `[product]_product`.`product_name` IS NULL THEN '#' ELSE `[product]_product`.`product_name` END, ']') AS `[Product].[Product]`, `[product]_product`.`product_name` AS `[Product].[Product].[MEMBER_CAPTION]` FROM (`product` AS `[product]_product` Left JOIN `product_class` AS `[product]_product_class` ON `[product]_product`.`product_class_id` = `[product]_product_class`.`product_class_id` Left JOIN `product_type` AS `[product]_product_type` ON `[product]_product_class`.`product_type_id` = `[product]_product_type`.`product_type_id`)"
    )

    expect(
      queryDimension(PRODUCT_DIMENSION, ENTITY_TYPE, {
        rows: [
          {
            dimension: '[Product]',
            level: '[Product].[Product Type]'
          },
          {
            dimension: '[Product]',
            level: '[Product].[Product Class]'
          },
          {
            dimension: '[Product]',
            level: '[Product].[Product]'
          }
        ],
        columns: [
          {
            dimension: C_MEASURES,
            measure: C_MEASURES_ROW_COUNT
          }
        ]
      })
    ).toEqual(
      "SELECT concat('[', CASE WHEN `[product]_product_type`.`product_type_id` IS NULL THEN '#' ELSE `[product]_product_type`.`product_type_id` END, ']') AS `[Product].[Product Type]`, `[product]_product_type`.`product_type_id` AS `[Product].[Product Type].[MEMBER_CAPTION]`, concat('[', CASE WHEN `[product]_product_type`.`product_type_id` IS NULL THEN '#' ELSE `[product]_product_type`.`product_type_id` END,'].[',CASE WHEN `[product]_product_class`.`product_class_id` IS NULL THEN '#' ELSE `[product]_product_class`.`product_class_id` END, ']') AS `[Product].[Product Class]`, `[product]_product_class`.`product_class_id` AS `[Product].[Product Class].[MEMBER_CAPTION]`, concat('[', CASE WHEN `[product]_product_type`.`product_type_id` IS NULL THEN '#' ELSE `[product]_product_type`.`product_type_id` END,'].[',CASE WHEN `[product]_product_class`.`product_class_id` IS NULL THEN '#' ELSE `[product]_product_class`.`product_class_id` END,'].[',CASE WHEN `[product]_product`.`product_name` IS NULL THEN '#' ELSE `[product]_product`.`product_name` END, ']') AS `[Product].[Product]`, `[product]_product`.`product_name` AS `[Product].[Product].[MEMBER_CAPTION]`, SUM(1) AS `Measures_Row_Count` FROM (`product` AS `[product]_product` Left JOIN `product_class` AS `[product]_product_class` ON `[product]_product`.`product_class_id` = `[product]_product_class`.`product_class_id` Left JOIN `product_type` AS `[product]_product_type` ON `[product]_product_class`.`product_type_id` = `[product]_product_type`.`product_type_id`) GROUP BY `[product]_product_type`.`product_type_id`, `[product]_product_class`.`product_class_id`, `[product]_product`.`product_name`"
    )

    expect(
      queryDimension(PRODUCT_DIMENSION, ENTITY_TYPE, {
        rows: [
          {
            dimension: '[Product]',
            hierarchy: '[Product.Class]',
            level: '[Product.Class].[Class]'
          },
          {
            dimension: '[Product]',
            hierarchy: '[Product.Class]',
            level: '[Product.Class].[Product Id]'
          }
        ],
        columns: [
          {
            dimension: C_MEASURES,
            measure: C_MEASURES_ROW_COUNT
          }
        ]
      })
    ).toEqual(
      "SELECT concat('[', CASE WHEN `[product.class]_product_class`.`product_class_id` IS NULL THEN '#' ELSE `[product.class]_product_class`.`product_class_id` END, ']') AS `[Product.Class].[Class]`, `[product.class]_product_class`.`product_class_id` AS `[Product.Class].[Class].[MEMBER_CAPTION]`, concat('[', CASE WHEN `[product.class]_product_class`.`product_class_id` IS NULL THEN '#' ELSE `[product.class]_product_class`.`product_class_id` END,'].[',CASE WHEN `[product.class]_product`.`product_id` IS NULL THEN '#' ELSE `[product.class]_product`.`product_id` END, ']') AS `[Product.Class].[Product Id]`, `[product.class]_product`.`product_name` AS `[Product.Class].[Product Id].[MEMBER_CAPTION]`, SUM(1) AS `Measures_Row_Count` FROM (`product` AS `[product.class]_product` Left JOIN `product_class` AS `[product.class]_product_class` ON `[product.class]_product`.`product_class_id` = `[product.class]_product_class`.`product_class_id`) GROUP BY `[product.class]_product_class`.`product_class_id`, `[product.class]_product`.`product_id`, `[product.class]_product`.`product_name`"
    )

    expect(
      queryDimension(
        PRODUCT_DIMENSION,
        ENTITY_TYPE,
        {
          rows: [
            {
              dimension: '[Product]',
              hierarchy: '[Product.Class]',
              level: '[Product.Class].[Class]'
            },
            {
              dimension: '[Product]',
              hierarchy: '[Product.Class]',
              level: '[Product.Class].[Product Id]'
            }
          ],
          columns: [
            {
              dimension: C_MEASURES,
              measure: C_MEASURES_ROW_COUNT
            }
          ]
        },
        'pg'
      )
    ).toEqual(
      `SELECT concat('[', CASE WHEN "[product.class]_product_class"."product_class_id" IS NULL THEN '#' ELSE CAST("[product.class]_product_class"."product_class_id" AS VARCHAR) END, ']') AS "[Product.Class].[Class]", concat('C_', "[product.class]_product_class"."product_class_id") AS "[Product.Class].[Class].[MEMBER_CAPTION]", concat('[', CASE WHEN "[product.class]_product_class"."product_class_id" IS NULL THEN '#' ELSE CAST("[product.class]_product_class"."product_class_id" AS VARCHAR) END,'].[',CASE WHEN "[product.class]_product"."product_id" IS NULL THEN '#' ELSE "[product.class]_product"."product_id" END, ']') AS "[Product.Class].[Product Id]", "[product.class]_product"."product_name" AS "[Product.Class].[Product Id].[MEMBER_CAPTION]", SUM(1) AS "Measures_Row_Count" FROM ("product" AS "[product.class]_product" Left JOIN "product_class" AS "[product.class]_product_class" ON "[product.class]_product"."product_class_id" = "[product.class]_product_class"."product_class_id") GROUP BY "[product.class]_product_class"."product_class_id", "[product.class]_product"."product_id", "[product.class]_product"."product_name"`
    )
  })

  it('Query Dimension with Property', () => {
    expect(
      queryDimension(PRODUCT_DIMENSION, ENTITY_TYPE, {
        rows: [
          {
            dimension: '[Product]',
            level: '[Product].[Product Type]'
          },
          {
            dimension: '[Product]',
            level: '[Product].[Product Class]'
          },
          {
            dimension: '[Product]',
            level: '[Product].[Product]',
            properties: ['[Product].[Shelf Width]']
          }
        ]
      })
    ).toEqual(
      "SELECT concat('[', CASE WHEN `[product]_product_type`.`product_type_id` IS NULL THEN '#' ELSE `[product]_product_type`.`product_type_id` END, ']') AS `[Product].[Product Type]`, `[product]_product_type`.`product_type_id` AS `[Product].[Product Type].[MEMBER_CAPTION]`, concat('[', CASE WHEN `[product]_product_type`.`product_type_id` IS NULL THEN '#' ELSE `[product]_product_type`.`product_type_id` END,'].[',CASE WHEN `[product]_product_class`.`product_class_id` IS NULL THEN '#' ELSE `[product]_product_class`.`product_class_id` END, ']') AS `[Product].[Product Class]`, `[product]_product_class`.`product_class_id` AS `[Product].[Product Class].[MEMBER_CAPTION]`, concat('[', CASE WHEN `[product]_product_type`.`product_type_id` IS NULL THEN '#' ELSE `[product]_product_type`.`product_type_id` END,'].[',CASE WHEN `[product]_product_class`.`product_class_id` IS NULL THEN '#' ELSE `[product]_product_class`.`product_class_id` END,'].[',CASE WHEN `[product]_product`.`product_name` IS NULL THEN '#' ELSE `[product]_product`.`product_name` END, ']') AS `[Product].[Product]`, `[product]_product`.`product_name` AS `[Product].[Product].[MEMBER_CAPTION]`, `[product]_product`.`shelf_width` AS `[Product].[Shelf Width]` FROM (`product` AS `[product]_product` Left JOIN `product_class` AS `[product]_product_class` ON `[product]_product`.`product_class_id` = `[product]_product_class`.`product_class_id` Left JOIN `product_type` AS `[product]_product_type` ON `[product]_product_class`.`product_type_id` = `[product]_product_type`.`product_type_id`)"
    )

    expect(
      queryDimension(PRODUCT_DIMENSION, ENTITY_TYPE, {
        rows: [
          {
            dimension: '[Product]',
            level: '[Product].[Product Type]'
          },
          {
            dimension: '[Product]',
            level: '[Product].[Product Class]'
          },
          {
            dimension: '[Product]',
            level: '[Product].[Product]',
            properties: ['[Product].[Shelf Width]']
          }
        ],
        columns: [
          {
            dimension: C_MEASURES,
            measure: C_MEASURES_ROW_COUNT
          }
        ]
      })
    ).toEqual(
      "SELECT concat('[', CASE WHEN `[product]_product_type`.`product_type_id` IS NULL THEN '#' ELSE `[product]_product_type`.`product_type_id` END, ']') AS `[Product].[Product Type]`, `[product]_product_type`.`product_type_id` AS `[Product].[Product Type].[MEMBER_CAPTION]`, concat('[', CASE WHEN `[product]_product_type`.`product_type_id` IS NULL THEN '#' ELSE `[product]_product_type`.`product_type_id` END,'].[',CASE WHEN `[product]_product_class`.`product_class_id` IS NULL THEN '#' ELSE `[product]_product_class`.`product_class_id` END, ']') AS `[Product].[Product Class]`, `[product]_product_class`.`product_class_id` AS `[Product].[Product Class].[MEMBER_CAPTION]`, concat('[', CASE WHEN `[product]_product_type`.`product_type_id` IS NULL THEN '#' ELSE `[product]_product_type`.`product_type_id` END,'].[',CASE WHEN `[product]_product_class`.`product_class_id` IS NULL THEN '#' ELSE `[product]_product_class`.`product_class_id` END,'].[',CASE WHEN `[product]_product`.`product_name` IS NULL THEN '#' ELSE `[product]_product`.`product_name` END, ']') AS `[Product].[Product]`, `[product]_product`.`product_name` AS `[Product].[Product].[MEMBER_CAPTION]`, `[product]_product`.`shelf_width` AS `[Product].[Shelf Width]`, SUM(1) AS `Measures_Row_Count` FROM (`product` AS `[product]_product` Left JOIN `product_class` AS `[product]_product_class` ON `[product]_product`.`product_class_id` = `[product]_product_class`.`product_class_id` Left JOIN `product_type` AS `[product]_product_type` ON `[product]_product_class`.`product_type_id` = `[product]_product_type`.`product_type_id`) GROUP BY `[product]_product_type`.`product_type_id`, `[product]_product_class`.`product_class_id`, `[product]_product`.`product_name`, `[product]_product`.`shelf_width`"
    )
  })
})

describe('Parent-child hierarchies', () => {
  it('Query Dimension', () => {
    expect(
      queryDimension(EMPLOYEE_DIMENSION, ENTITY_TYPE, {
        rows: [
          {
            dimension: '[Employee]',
            level: '[Employee].[Name]',
            properties: ['[Employee].[Name].[PARENT_UNIQUE_NAME]']
          }
        ]
      })
    ).toEqual(
      "SELECT concat('[', CASE WHEN `[employee]_employee`.`full_name` IS NULL THEN '#' ELSE `[employee]_employee`.`full_name` END, ']') AS `[Employee].[Name]`, `[employee]_employee`.`full_name` AS `[Employee].[Name].[MEMBER_CAPTION]`, concat('[', CASE WHEN `[employee]_employee(1)`.`full_name` IS NULL THEN '#' ELSE `[employee]_employee(1)`.`full_name` END, ']') AS `[Employee].[Name].[PARENT_UNIQUE_NAME]` FROM (`employee` AS `[employee]_employee` Left JOIN `employee` AS `[employee]_employee(1)` ON `[employee]_employee`.`supervisor_id` = `[employee]_employee(1)`.`employee_id`)"
    )
  })

  it('Query Dimension with Count Measure', () => {
    expect(
      queryDimension(EMPLOYEE_DIMENSION, ENTITY_TYPE, {
        rows: [
          {
            dimension: '[Employee]',
            level: '[Employee].[Name]',
            properties: ['[Employee].[Name].[PARENT_UNIQUE_NAME]']
          }
        ],
        columns: [
          {
            dimension: C_MEASURES,
            measure: C_MEASURES_ROW_COUNT
          }
        ]
      })
    ).toEqual(
      "SELECT concat('[', CASE WHEN `[employee]_employee`.`full_name` IS NULL THEN '#' ELSE `[employee]_employee`.`full_name` END, ']') AS `[Employee].[Name]`, `[employee]_employee`.`full_name` AS `[Employee].[Name].[MEMBER_CAPTION]`, concat('[', CASE WHEN `[employee]_employee(1)`.`full_name` IS NULL THEN '#' ELSE `[employee]_employee(1)`.`full_name` END, ']') AS `[Employee].[Name].[PARENT_UNIQUE_NAME]`, SUM(1) AS `Measures_Row_Count` FROM (`employee` AS `[employee]_employee` Left JOIN `employee` AS `[employee]_employee(1)` ON `[employee]_employee`.`supervisor_id` = `[employee]_employee(1)`.`employee_id`) GROUP BY `[employee]_employee`.`full_name`, `[employee]_employee(1)`.`full_name`"
    )
  })

  it('Query Dimension with Count Measure pg', () => {
    expect(
      queryDimension(
        EMPLOYEE_DIMENSION,
        ENTITY_TYPE,
        {
          rows: [
            {
              dimension: '[Employee]',
              level: '[Employee].[Name]',
              properties: ['[Employee].[Name].[PARENT_UNIQUE_NAME]']
            }
          ],
          columns: [
            {
              dimension: C_MEASURES,
              measure: C_MEASURES_ROW_COUNT
            }
          ]
        },
        'pg'
      )
    ).toEqual(
      `SELECT concat('[', CASE WHEN "[employee]_employee"."full_name" IS NULL THEN '#' ELSE "[employee]_employee"."full_name" END, ']') AS "[Employee].[Name]", "[employee]_employee"."full_name" AS "[Employee].[Name].[MEMBER_CAPTION]", concat('[', CASE WHEN "[employee]_employee(1)"."full_name" IS NULL THEN '#' ELSE "[employee]_employee(1)"."full_name" END, ']') AS "[Employee].[Name].[PARENT_UNIQUE_NAME]", SUM(1) AS "Measures_Row_Count" FROM ("employee" AS "[employee]_employee" Left JOIN "employee" AS "[employee]_employee(1)" ON "[employee]_employee"."supervisor_id" = "[employee]_employee(1)"."employee_id") GROUP BY "[employee]_employee"."full_name", "[employee]_employee(1)"."full_name"`
    )
  })
})

describe('Convert Dimension Schema to Runtime', () => {
  beforeAll(() => {
    //
  })

  it('Runtime Dimension', () => {
    expect(
      compileDimensionSchema(ENTITY_TYPE_SALESORDER.name, {
        ...PRODUCT_DIMENSION,
        name: 'Product Class',
        foreignKey: 'product_id'
      })
    ).toEqual(ENTITY_TYPE_SALESORDER.properties['[Product Class]'])

    expect(
      compileDimensionSchema(ENTITY_TYPE_SALESORDER.name, {
        ...SHARED_DIMENSION_CUSTOMER,
        foreignKey: 'customer_id'
      })
    ).toEqual(ENTITY_TYPE_SALESORDER.properties['[Customer]'])
  })
})

describe('Get Dimension Members', () => {

  it('Dimension Members', () => {
    const statement = DimensionMembers(
      'Product',
      { dimension: '[Product]', hierarchy: '[Product.Class]' },
      ENTITY_TYPE,
      { name: 'Sales', dimensions: [PRODUCT_DIMENSION] },
      'pg'
    )

    expect(statement[0]).toEqual(
      `SELECT '[(All)]' AS "memberKey", 'All' AS "memberCaption" FROM ("product" AS "[product.class]_product" Left JOIN "product_class" AS "[product.class]_product_class" ON "[product.class]_product"."product_class_id" = "[product.class]_product_class"."product_class_id") GROUP BY 1`
    )
    expect(statement[1]).toEqual(
      `SELECT concat('[', CASE WHEN "[product.class]_product_class"."product_class_id" IS NULL THEN '#' ELSE CAST("[product.class]_product_class"."product_class_id" AS VARCHAR) END, ']') AS "memberKey", concat('C_', "[product.class]_product_class"."product_class_id") AS "memberCaption", '[(All)]' AS "parentKey" FROM ("product" AS "[product.class]_product" Left JOIN "product_class" AS "[product.class]_product_class" ON "[product.class]_product"."product_class_id" = "[product.class]_product_class"."product_class_id") GROUP BY "[product.class]_product_class"."product_class_id" ORDER BY "[product.class]_product_class"."product_class_id"`
    )
    expect(statement[2]).toEqual(
      `SELECT concat('[', CASE WHEN "[product.class]_product_class"."product_class_id" IS NULL THEN '#' ELSE CAST("[product.class]_product_class"."product_class_id" AS VARCHAR) END,'].[',CASE WHEN "[product.class]_product"."product_id" IS NULL THEN '#' ELSE "[product.class]_product"."product_id" END, ']') AS "memberKey", "[product.class]_product"."product_name" AS "memberCaption", concat('[', CASE WHEN "[product.class]_product_class"."product_class_id" IS NULL THEN '#' ELSE CAST("[product.class]_product_class"."product_class_id" AS VARCHAR) END, ']') AS "parentKey" FROM ("product" AS "[product.class]_product" Left JOIN "product_class" AS "[product.class]_product_class" ON "[product.class]_product"."product_class_id" = "[product.class]_product_class"."product_class_id") GROUP BY "[product.class]_product_class"."product_class_id", "[product.class]_product"."product_id", "[product.class]_product"."product_name" ORDER BY "[product.class]_product_class"."product_class_id","[product.class]_product"."product_id"`
    )
  })

  it('Members for Degenerate Dimension', () => {
    const statements = DimensionMembers(
      ENTITY_TYPE_SALESORDER.name,
      { dimension: '[Payment method]' },
      ENTITY_TYPE_SALESORDER,
      { name: 'Sales', dimensions: [PRODUCT_DIMENSION], cubes: [CUBE_SALESORDER] },
      'pg'
    )
    expect(statements[0]).toEqual(
      'SELECT \'[All]\' AS "memberKey", \'所有\' AS "memberCaption" FROM "sales_fact" GROUP BY 1'
    )

    expect(statements[1]).toEqual(
      'SELECT concat(\'[\', CASE WHEN "sales_fact"."payment_method" IS NULL THEN \'#\' ELSE "sales_fact"."payment_method" END, \']\') AS "memberKey", "sales_fact"."payment_method" AS "memberCaption", \'[All]\' AS "parentKey" FROM "sales_fact" GROUP BY "sales_fact"."payment_method" ORDER BY "sales_fact"."payment_method"'
    )
  })

  it('Orignal table column members', () => {
    const statement = DimensionMembers(
      'sales_fact',
      { dimension: 'Product' },
      { ...ENTITY_TYPE, name: 'sales_fact' },
      null,
      ''
    )
    expect(statement).toEqual(['SELECT DISTINCT `Product` AS `memberKey` FROM `sales_fact`'])
  })
})

describe('Get Dimension Members for Hive', () => {
  it('Dimension Members', () => {
    const statement = DimensionMembers(
      'Product',
      { dimension: '[Product]' },
      ENTITY_TYPE,
      { name: 'Sales', dimensions: [PRODUCT_DIMENSION] },
      'hive',
      'foodmart'
    )
    expect(statement[0]).toEqual(
      "SELECT concat('[', CASE WHEN `[product]_product_type`.`product_type_id` IS NULL THEN '#' ELSE `[product]_product_type`.`product_type_id` END, ']') AS `memberKey`, `[product]_product_type`.`product_type_id` AS `memberCaption` FROM (`foodmart`.`product` AS `[product]_product` Left JOIN `foodmart`.`product_class` AS `[product]_product_class` ON `[product]_product`.`product_class_id` = `[product]_product_class`.`product_class_id` Left JOIN `foodmart`.`product_type` AS `[product]_product_type` ON `[product]_product_class`.`product_type_id` = `[product]_product_type`.`product_type_id`) GROUP BY `[product]_product_type`.`product_type_id` ORDER BY `[product]_product_type`.`product_type_id`"
    )

    expect(statement[1]).toEqual(
      "SELECT concat('[', CASE WHEN `[product]_product_type`.`product_type_id` IS NULL THEN '#' ELSE `[product]_product_type`.`product_type_id` END,'].[',CASE WHEN `[product]_product_class`.`product_class_id` IS NULL THEN '#' ELSE `[product]_product_class`.`product_class_id` END, ']') AS `memberKey`, `[product]_product_class`.`product_class_id` AS `memberCaption`, concat('[', CASE WHEN `[product]_product_type`.`product_type_id` IS NULL THEN '#' ELSE `[product]_product_type`.`product_type_id` END, ']') AS `parentKey` FROM (`foodmart`.`product` AS `[product]_product` Left JOIN `foodmart`.`product_class` AS `[product]_product_class` ON `[product]_product`.`product_class_id` = `[product]_product_class`.`product_class_id` Left JOIN `foodmart`.`product_type` AS `[product]_product_type` ON `[product]_product_class`.`product_type_id` = `[product]_product_type`.`product_type_id`) GROUP BY `[product]_product_type`.`product_type_id`, `[product]_product_class`.`product_class_id` ORDER BY `[product]_product_type`.`product_type_id`,`[product]_product_class`.`product_class_id`"
    )

    expect(statement[2]).toEqual(
      "SELECT concat('[', CASE WHEN `[product]_product_type`.`product_type_id` IS NULL THEN '#' ELSE `[product]_product_type`.`product_type_id` END,'].[',CASE WHEN `[product]_product_class`.`product_class_id` IS NULL THEN '#' ELSE `[product]_product_class`.`product_class_id` END,'].[',CASE WHEN `[product]_product`.`product_name` IS NULL THEN '#' ELSE `[product]_product`.`product_name` END, ']') AS `memberKey`, `[product]_product`.`product_name` AS `memberCaption`, concat('[', CASE WHEN `[product]_product_type`.`product_type_id` IS NULL THEN '#' ELSE `[product]_product_type`.`product_type_id` END,'].[',CASE WHEN `[product]_product_class`.`product_class_id` IS NULL THEN '#' ELSE `[product]_product_class`.`product_class_id` END, ']') AS `parentKey` FROM (`foodmart`.`product` AS `[product]_product` Left JOIN `foodmart`.`product_class` AS `[product]_product_class` ON `[product]_product`.`product_class_id` = `[product]_product_class`.`product_class_id` Left JOIN `foodmart`.`product_type` AS `[product]_product_type` ON `[product]_product_class`.`product_type_id` = `[product]_product_type`.`product_type_id`) GROUP BY `[product]_product_type`.`product_type_id`, `[product]_product_class`.`product_class_id`, `[product]_product`.`product_name`, `[product]_product`.`product_id` ORDER BY `[product]_product_type`.`product_type_id`,`[product]_product_class`.`product_class_id`,`[product]_product`.`product_id`"
    )
  })

  it('Dimension Members', () => {
    const statement = DimensionMembers(
      'Product',
      { dimension: '[Product]', hierarchy: '[Product.Class]' },
      ENTITY_TYPE,
      { name: 'Sales', dimensions: [PRODUCT_DIMENSION] },
      'hive',
      'foodmart'
    )

    expect(statement[0]).toEqual(
      "SELECT '[(All)]' AS `memberKey`, 'All' AS `memberCaption` FROM (`foodmart`.`product` AS `[product.class]_product` Left JOIN `foodmart`.`product_class` AS `[product.class]_product_class` ON `[product.class]_product`.`product_class_id` = `[product.class]_product_class`.`product_class_id`) GROUP BY 1"
    )

    expect(statement[1]).toEqual(
      "SELECT concat('[', CASE WHEN `[product.class]_product_class`.`product_class_id` IS NULL THEN '#' ELSE `[product.class]_product_class`.`product_class_id` END, ']') AS `memberKey`, `[product.class]_product_class`.`product_class_id` AS `memberCaption`, '[(All)]' AS `parentKey` FROM (`foodmart`.`product` AS `[product.class]_product` Left JOIN `foodmart`.`product_class` AS `[product.class]_product_class` ON `[product.class]_product`.`product_class_id` = `[product.class]_product_class`.`product_class_id`) GROUP BY `[product.class]_product_class`.`product_class_id` ORDER BY `[product.class]_product_class`.`product_class_id`"
    )

    expect(statement[2]).toEqual(
      "SELECT concat('[', CASE WHEN `[product.class]_product_class`.`product_class_id` IS NULL THEN '#' ELSE `[product.class]_product_class`.`product_class_id` END,'].[',CASE WHEN `[product.class]_product`.`product_id` IS NULL THEN '#' ELSE `[product.class]_product`.`product_id` END, ']') AS `memberKey`, `[product.class]_product`.`product_name` AS `memberCaption`, concat('[', CASE WHEN `[product.class]_product_class`.`product_class_id` IS NULL THEN '#' ELSE `[product.class]_product_class`.`product_class_id` END, ']') AS `parentKey` FROM (`foodmart`.`product` AS `[product.class]_product` Left JOIN `foodmart`.`product_class` AS `[product.class]_product_class` ON `[product.class]_product`.`product_class_id` = `[product.class]_product_class`.`product_class_id`) GROUP BY `[product.class]_product_class`.`product_class_id`, `[product.class]_product`.`product_id`, `[product.class]_product`.`product_name` ORDER BY `[product.class]_product_class`.`product_class_id`,`[product.class]_product`.`product_id`"
    )
  })

  it('Orignal table column members', () => {
    const statement = DimensionMembers(
      'sales_fact',
      { dimension: 'Product' },
      { ...ENTITY_TYPE, name: 'sales_fact' },
      null,
      'hive',
      'foodmart'
    )
    expect(statement).toEqual(['SELECT DISTINCT `Product` AS `memberKey` FROM `foodmart`.`sales_fact`'])
  })
})

describe('Dimension Level', () => {
  it('#LevelCaptionFields', () => {
    expect(LevelCaptionField('product', ENTITY_TYPE.properties['[Product]'].hierarchies[1].levels[1], 'pg')).toEqual({
      column: 'product_class_id',
      expression: 'concat(\'C_\', "[product.class]_product_class"."product_class_id")',
      table: 'product'
    })

    expect(LevelCaptionField('product', ENTITY_TYPE.properties['[Product]'].hierarchies[1].levels[1], 'mysql')).toEqual(
      {
        column: 'product_class_id',
        table: 'product'
      }
    )
  })

  it('#LevelMembers', () => {
    expect(LevelMembers('sales_fact', ENTITY_TYPE.properties['[Product]'].hierarchies[1], 1, 'pg', 'aaaa')).toEqual(
      `SELECT concat('[', CASE WHEN "[product.class]_product_class"."product_class_id" IS NULL THEN '#' ELSE CAST("[product.class]_product_class"."product_class_id" AS VARCHAR) END, ']') AS "memberKey", concat('C_', "[product.class]_product_class"."product_class_id") AS "memberCaption", '[(All)]' AS "parentKey" FROM ("product" AS "[product.class]_product" Left JOIN "product_class" AS "[product.class]_product_class" ON "[product.class]_product"."product_class_id" = "[product.class]_product_class"."product_class_id") GROUP BY "[product.class]_product_class"."product_class_id" ORDER BY "[product.class]_product_class"."product_class_id"`
    )
  })
})
