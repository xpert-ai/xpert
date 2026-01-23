import {
  AggregationRole,
  CalculationProperty,
  Cube,
  DimensionType,
  EntityProperty,
  EntitySemantics,
  EntityType,
  FilteringLogic,
  IAdvancedFilter,
  Indicator,
  IndicatorType,
  mapIndicatorToMeasures,
  PropertyDimension,
  Schema,
  Semantics
} from '@metad/ocap-core'
import { compileDimensionSchema } from './dimension'
import { serializeUniqueName } from './utils'

export const PRODUCT_DIMENSION: PropertyDimension = {
  name: 'Product',
  hierarchies: [
    {
      name: '',
      primaryKey: 'product_id',
      primaryKeyTable: 'product',
      tables: [
        {
          name: 'product'
        },
        {
          name: 'product_class',
          join: {
            type: 'Left',
            fields: [
              {
                leftKey: 'product_class_id',
                rightKey: 'product_class_id'
              }
            ]
          }
        },
        {
          name: 'product_type',
          join: {
            type: 'Left',
            fields: [
              {
                leftKey: 'product_type_id',
                rightKey: 'product_type_id'
              }
            ]
          }
        }
      ],
      levels: [
        {
          name: 'Product Type',
          column: 'product_type_id',
          type: 'Integer',
          table: 'product_type',
          uniqueMembers: true
        },
        {
          name: 'Product Class',
          column: 'product_class_id',
          type: 'Integer',
          table: 'product_class',
          uniqueMembers: null,
          captionExpression: {
            sql: {
              dialect: 'pg',
              content: `concat('C_', "[product]_product_class"."product_class_id")`
            }
          },
          properties: [
            {
              name: 'Category',
              column: 'product_category'
            }
          ]
        },
        {
          name: 'Product',
          column: 'product_id',
          table: 'product',
          nameColumn: 'product_name',
          uniqueMembers: true,
          properties: [
            {
              name: 'Shelf Width',
              column: 'shelf_width'
            },
            {
              name: 'Units PerCase',
              column: 'units_per_case'
            }
          ]
        }
      ]
    },
    {
      name: 'Class',
      hasAll: true,
      primaryKey: 'product_id',
      primaryKeyTable: 'product',
      tables: [
        {
          name: 'product'
        },
        {
          name: 'product_class',
          join: {
            type: 'Left',
            fields: [
              {
                leftKey: 'product_class_id',
                rightKey: 'product_class_id'
              }
            ]
          }
        }
      ],
      levels: [
        {
          name: 'Class',
          column: 'product_class_id',
          type: 'Integer',
          table: 'product_class',
          captionExpression: {
            sql: {
              dialect: 'pg',
              content: `concat('C_', "[product.class]_product_class"."product_class_id")`
            }
          },
          properties: [
            {
              name: 'Category',
              column: 'product_category'
            }
          ]
        },
        {
          name: 'Product Id',
          column: 'product_id',
          table: 'product',
          captionColumn: 'product_name',
          properties: [
            {
              name: 'Shelf Width',
              column: 'shelf_width'
            },
            {
              name: 'Units PerCase',
              column: 'units_per_case'
            }
          ]
        }
      ]
    }
  ]
}

export const SHARED_DIMENSION_CUSTOMER: PropertyDimension = {
  name: 'Customer',
  caption: '客户',
  hierarchies: [
    {
      name: '',
      primaryKey: 'customer_id',
      primaryKeyTable: 'customer',
      tables: [
        {
          name: 'customer'
        }
      ],
      hasAll: true,
      levels: [
        {
          name: 'Country',
          column: 'country',
          uniqueMembers: true,
          caption: '国家'
        },
        {
          name: 'City',
          column: 'city',
          uniqueMembers: false,
          caption: '城市'
        },
        {
          name: 'Name',
          column: 'fname',
          captionColumn: 'fname',
          uniqueMembers: true,
          caption: '客户名称'
        }
      ]
    }
  ]
}

export const EMPLOYEE_DIMENSION: PropertyDimension = {
  name: 'Employee',
  hierarchies: [
    {
      name: '',
      tables: [{ name: 'employee' }],
      primaryKey: 'employee_id',
      levels: [
        {
          name: 'Name',
          column: 'employee_id',
          nameColumn: 'full_name',
          parentColumn: 'supervisor_id',
          uniqueMembers: true,
        }
      ]
    }
  ]
}

export const SHARED_DIMENSION_TIME: PropertyDimension = {
  __id__: '590d2e4a-ef71-49e4-b53f-36100cc5b004',
  name: 'Time',
  caption: '日历',
  type: DimensionType.TimeDimension,
  semantics: {
    semantic: Semantics.Calendar
  },
  hierarchies: [
    {
      __id__: 'cfdc9bab-46e4-4220-8cdf-44f1b5c7145c',
      name: '',
      caption: '日历',
      hasAll: true,
      primaryKey: 'time_id',
      tables: [{ name: 'time_by_day' }],
      levels: [
        {
          __id__: 'c3dc9239-8729-40bb-8e28-1c0a05d29834',
          column: 'the_year',
          type: 'Integer',
          name: 'Year',
          caption: '年',
          uniqueMembers: true,
          nameColumn: null,
          parentColumn: null,
          nullParentValue: null,
          levelType: 'TimeYears',
          semantics: {
            semantic: Semantics['Calendar.Year'],
            formatter: '[yyyy]'
          }
        },
        {
          __id__: 'b5a0d2b8-c853-4480-bbaa-59a073b53047',
          column: 'quarter',
          name: 'Quarter',
          caption: '季度',
          uniqueMembers: null,
          nameColumn: null,
          parentColumn: null,
          nullParentValue: null,
          levelType: 'TimeQuarters',
          semantics: {
            semantic: Semantics['Calendar.Quarter'],
            formatter: "[yyyy].['Q'Q]"
          },
          captionColumn: null,
          ordinalColumn: null,
          captionExpression: {
            sql: { dialect: 'generic', content: '"the_year" || "quarter"' }
          }
        },
        {
          __id__: 'cc0f564e-73ef-4761-bac7-2daa83cb7487',
          column: 'month_of_year',
          name: 'Month',
          caption: '月',
          nameColumn: null,
          uniqueMembers: null,
          parentColumn: null,
          nullParentValue: null,
          levelType: 'TimeMonths',
          semantics: {
            semantic: Semantics['Calendar.Month'],
            formatter: "[yyyy].['Q'Q].[M]"
          },
          captionColumn: 'the_month',
          ordinalColumn: 'month_of_year'
        },
        {
          __id__: 'a8f5b556-e278-42ba-8b8d-fcfdab8538c2',
          column: 'the_date',
          name: 'Day',
          caption: '日期',
          uniqueMembers: true,
          nameColumn: null,
          parentColumn: null,
          nullParentValue: null,
          levelType: 'TimeDays',
          semantics: {
            semantic: Semantics['Calendar.Day'],
            formatter: "[yyyy].['Q'Q].[M].[yyyy-MM-dd]"
          }
        }
      ]
    },
    {
      __id__: '121096fb-bf4e-42c4-a776-c52c87fcf73c',
      caption: '周日历',
      hasAll: true,
      name: 'Weekly',
      allMemberName: null,
      tables: [{ name: 'time_by_day' }],
      primaryKey: 'time_id',
      levels: [
        {
          __id__: '651b5863-ade3-4e97-a384-f9d778550927',
          column: 'the_year',
          type: 'Integer',
          name: 'Year',
          caption: '年',
          memberCaption: '[Time.Weekly].[Year].[MEMBER_CAPTION]',
          uniqueMembers: true,
          nameColumn: null,
          captionColumn: null,
          parentColumn: null,
          nullParentValue: null,
          levelType: 'TimeYears',
          semantics: { semantic: Semantics['Calendar.Year'] }
        },
        {
          __id__: '3a35e9a2-b908-404a-bb11-8ba8404b1cfd',
          column: 'week_of_year',
          name: 'Week',
          caption: '周',
          memberCaption: '[Time.Weekly].[Week].[MEMBER_CAPTION]',
          uniqueMembers: null,
          nameColumn: null,
          captionColumn: null,
          parentColumn: null,
          nullParentValue: null,
          levelType: 'TimeWeeks',
          semantics: {
            semantic: Semantics['Calendar.Week'],
            formatter: '[yyyy].[W]'
          }
        },
        {
          __id__: '381b0a26-dbc1-41bb-bc5d-d9c61c17d9f0',
          column: 'day_of_month',
          name: 'Day',
          caption: '日',
          memberCaption: '[Time.Weekly].[Day].[MEMBER_CAPTION]',
          uniqueMembers: null,
          nameColumn: null,
          captionColumn: null,
          parentColumn: null,
          nullParentValue: null,
          levelType: 'TimeDays',
          semantics: {
            semantic: Semantics['Calendar.Day'],
            formatter: '[yyyy].[W].[Do]'
          }
        }
      ]
    }
  ]
}

export const CUBE_SALESORDER: Cube = {
  name: 'SalesOrder',
  caption: '销售订单',
  fact: {
    type: 'table',
    table: { name: 'sales_fact' }
  },
  defaultMeasure: 'Sales',
  visible: true,
  dimensionUsages: [
    {
      __id__: '22f3cdd3-c6d6-42a1-a312-6d75c7b40d8b',
      name: 'Time',
      source: 'Time',
      foreignKey: 'time_id'
    },
    {
      __id__: '22f3cdd3-c6d6-42a1-a312-6d75c7b40d89',
      name: 'Product Class',
      source: PRODUCT_DIMENSION.name,
      foreignKey: 'product_id'
    },
    {
      __id__: '3571a32a-1365-4e7f-875e-6520537f5b50',
      name: 'Customer',
      source: SHARED_DIMENSION_CUSTOMER.name,
      foreignKey: 'customer_id'
    }
  ],
  dimensions: [
    {
      __id__: '3571a32a-1365-4e7f-875e-6520537f5b48',
      name: 'Product',
      caption: '产品',
      foreignKey: 'product_id',
      hierarchies: [
        {
          name: '',
          __id__: '8531da03-2485-4281-ba4f-678c0fb25e15',
          caption: '产品',
          hasAll: true,
          primaryKey: 'product_id',
          tables: [{ name: 'product' }],
          levels: [
            {
              __id__: '1e8f6622-6ce2-4187-8ae6-0be581614804',
              column: 'brand_name',
              properties: [],
              name: 'Brand Name',
              caption: '品牌',
              uniqueMembers: true,
              nameColumn: null,
              captionColumn: null,
              ordinalColumn: null,
              parentColumn: null,
              nullParentValue: null,
              table: 'product'
            },
            {
              __id__: 'c13911a4-d8b2-486e-afc7-894c21079b95',
              column: 'product_id',
              properties: [
                {
                  column: 'SKU',
                  name: 'SKU'
                },
                {
                  column: 'gross_weight',
                  name: 'Gross Weight'
                },
                {
                  column: 'shelf_width',
                  name: 'Shelf Width'
                }
              ],
              name: 'Product',
              caption: '产品',
              nameColumn: 'product_name',
              uniqueMembers: null,
              captionColumn: null,
              ordinalColumn: null,
              parentColumn: null,
              nullParentValue: null,
              table: 'product'
            }
          ]
        }
      ]
    },
    {
      name: 'Payment method',
      caption: '付款方式',
      memberCaption: '[Payment method].[MEMBER_CAPTION]',
      hierarchies: [
        {
          name: '',
          hasAll: true,
          allMemberName: 'All',
          allMemberCaption: '所有',
          levels: [
            {
              name: 'Payment method',
              column: 'payment_method',
              uniqueMembers: true,
              caption: '付款方式'
            }
          ]
        }
      ]
    }
  ],
  measures: [
    {
      __id__: '1c05abfc-56e1-46c8-a312-01a4915b1ff9',
      name: 'Sales',
      aggregator: 'sum',
      column: 'store_sales',
      caption: '销售额'
    },
    {
      __id__: 'a1eebb49-c622-455f-b43e-f35764757e2f',
      name: 'Cost',
      aggregator: 'sum',
      caption: '成本',
      column: 'store_cost'
    }
  ],
  calculatedMembers: [
    {
      __id__: 'bmSRyRTE8h',
      name: 'Profit',
      dimension: 'Measures',
      formula: '`sales_fact`.`store_sales` - `sales_fact`.`store_cost`',
      caption: '利润',
      visible: true,
      properties: [],
      aggregator: 'SUM'
    }
  ]
}

export const ENTITY_TYPE_SALESORDER: EntityType = {
  name: 'SalesOrder',
  caption: '销售订单',
  defaultMeasure: 'Sales',
  visible: true,
  properties: {
    '[Time]': {
      __id__: '590d2e4a-ef71-49e4-b53f-36100cc5b004',
      entity: 'SalesOrder',
      name: '[Time]',
      caption: '日历',
      memberCaption: '[Time].[MEMBER_CAPTION]',
      type: 'TimeDimension',
      foreignKey: 'time_id',
      role: AggregationRole.dimension,
      semantics: {
        semantic: Semantics.Calendar
      },
      hierarchies: [
        {
          __id__: 'cfdc9bab-46e4-4220-8cdf-44f1b5c7145c',
          entity: 'SalesOrder',
          dimension: '[Time]',
          name: '[Time]',
          caption: '日历',
          memberCaption: '[Time].[MEMBER_CAPTION]',
          primaryKey: 'time_id',
          hasAll: true,
          role: AggregationRole.hierarchy,
          tables: [
            {
              name: 'time_by_day'
            }
          ],

          levels: [
            {
              entity: 'SalesOrder',
              dimension: '[Time]',
              hierarchy: '[Time]',
              name: '[Time].[(All Times)]',
              caption: '(All Times)',
              memberCaption: '[Time].[(All Times)].[MEMBER_CAPTION]',
              levelNumber: 0,
              role: AggregationRole.level,
              properties: []
            },
            {
              __id__: 'c3dc9239-8729-40bb-8e28-1c0a05d29834',
              memberCaption: '[Time].[Year].[MEMBER_CAPTION]',
              column: 'the_year',
              type: "Integer",
              entity: 'SalesOrder',
              dimension: '[Time]',
              hierarchy: '[Time]',
              caption: '年',
              levelType: 'TimeYears',
              name: '[Time].[Year]',
              nameColumn: null,
              nullParentValue: null,
              parentColumn: null,
              properties: [],
              role: AggregationRole.level,
              levelNumber: 1,
              semantics: {
                formatter: '[yyyy]',
                semantic: Semantics['Calendar.Year']
              },
              uniqueMembers: true
            },
            {
              __id__: 'b5a0d2b8-c853-4480-bbaa-59a073b53047',
              captionColumn: null,
              captionExpression: {
                sql: {
                  content: '"the_year" || "quarter"',
                  dialect: 'generic'
                }
              },
              column: 'quarter',
              entity: 'SalesOrder',
              dimension: '[Time]',
              hierarchy: '[Time]',
              caption: '季度',
              memberCaption: '[Time].[Quarter].[MEMBER_CAPTION]',
              levelType: 'TimeQuarters',
              name: '[Time].[Quarter]',
              nameColumn: null,
              nullParentValue: null,
              ordinalColumn: null,
              parentColumn: null,
              properties: [],
              role: AggregationRole.level,
              levelNumber: 2,
              semantics: {
                formatter: "[yyyy].['Q'Q]",
                semantic: Semantics['Calendar.Quarter']
              },
              uniqueMembers: null
            },
            {
              __id__: 'cc0f564e-73ef-4761-bac7-2daa83cb7487',
              captionColumn: 'the_month',
              column: 'month_of_year',
              entity: 'SalesOrder',
              dimension: '[Time]',
              hierarchy: '[Time]',
              caption: '月',
              memberCaption: '[Time].[Month].[MEMBER_CAPTION]',
              levelType: 'TimeMonths',
              name: '[Time].[Month]',
              nameColumn: null,
              nullParentValue: null,
              ordinalColumn: 'month_of_year',
              parentColumn: null,
              properties: [],
              role: AggregationRole.level,
              levelNumber: 3,
              semantics: {
                formatter: "[yyyy].['Q'Q].[M]",
                semantic: Semantics['Calendar.Month']
              },
              uniqueMembers: null
            },
            {
              __id__: 'a8f5b556-e278-42ba-8b8d-fcfdab8538c2',
              column: 'the_date',
              entity: 'SalesOrder',
              dimension: '[Time]',
              hierarchy: '[Time]',
              caption: '日期',
              memberCaption: '[Time].[Day].[MEMBER_CAPTION]',
              levelType: 'TimeDays',
              name: '[Time].[Day]',
              nameColumn: null,
              nullParentValue: null,
              parentColumn: null,
              properties: [],
              role: AggregationRole.level,
              levelNumber: 4,
              semantics: {
                formatter: "[yyyy].['Q'Q].[M].[yyyy-MM-dd]",
                semantic: Semantics['Calendar.Day']
              },
              uniqueMembers: true
            }
          ]
        },
        {
          __id__: '121096fb-bf4e-42c4-a776-c52c87fcf73c',
          allMemberName: null,
          entity: 'SalesOrder',
          dimension: '[Time]',
          name: '[Time.Weekly]',
          memberCaption: '[Time.Weekly].[MEMBER_CAPTION]',
          primaryKey: 'time_id',
          role: AggregationRole.hierarchy,
          hasAll: true,
          caption: '周日历',
          tables: [
            {
              name: 'time_by_day'
            }
          ],
          levels: [
            {
              entity: 'SalesOrder',
              dimension: '[Time]',
              hierarchy: '[Time.Weekly]',
              name: '[Time.Weekly].[(All Weeklys)]',
              caption: '(All Weeklys)',
              memberCaption: '[Time.Weekly].[(All Weeklys)].[MEMBER_CAPTION]',
              levelNumber: 0,
              role: AggregationRole.level,
              properties: []
            },
            {
              __id__: '651b5863-ade3-4e97-a384-f9d778550927',
              captionColumn: null,
              column: 'the_year',
              type: "Integer",
              entity: 'SalesOrder',
              dimension: '[Time]',
              hierarchy: '[Time.Weekly]',
              levelType: 'TimeYears',
              name: '[Time.Weekly].[Year]',
              caption: '年',
              memberCaption: '[Time.Weekly].[Year].[MEMBER_CAPTION]',
              nameColumn: null,
              nullParentValue: null,
              parentColumn: null,
              properties: [],
              role: AggregationRole.level,
              levelNumber: 1,
              semantics: {
                semantic: Semantics['Calendar.Year']
              },
              uniqueMembers: true
            },
            {
              __id__: '3a35e9a2-b908-404a-bb11-8ba8404b1cfd',
              captionColumn: null,
              column: 'week_of_year',
              entity: 'SalesOrder',
              dimension: '[Time]',
              hierarchy: '[Time.Weekly]',
              caption: '周',
              memberCaption: '[Time.Weekly].[Week].[MEMBER_CAPTION]',
              levelType: 'TimeWeeks',
              name: '[Time.Weekly].[Week]',
              nameColumn: null,
              nullParentValue: null,
              parentColumn: null,
              properties: [],
              role: AggregationRole.level,
              levelNumber: 2,
              semantics: {
                formatter: '[yyyy].[W]',
                semantic: Semantics['Calendar.Week']
              },
              uniqueMembers: null
            },
            {
              __id__: '381b0a26-dbc1-41bb-bc5d-d9c61c17d9f0',
              captionColumn: null,
              column: 'day_of_month',
              entity: 'SalesOrder',
              dimension: '[Time]',
              hierarchy: '[Time.Weekly]',
              caption: '日',
              memberCaption: '[Time.Weekly].[Day].[MEMBER_CAPTION]',
              levelType: 'TimeDays',
              name: '[Time.Weekly].[Day]',
              nameColumn: null,
              nullParentValue: null,
              parentColumn: null,
              properties: [],
              role: AggregationRole.level,
              levelNumber: 3,
              semantics: {
                formatter: '[yyyy].[W].[Do]',
                semantic: Semantics['Calendar.Day']
              },
              uniqueMembers: null
            }
          ]
        }
      ]
    },
    '[Product]': {
      __id__: '3571a32a-1365-4e7f-875e-6520537f5b48',
      name: '[Product]',
      caption: '产品',
      foreignKey: 'product_id',
      hierarchies: [
        {
          name: '[Product]',
          __id__: '8531da03-2485-4281-ba4f-678c0fb25e15',
          caption: '产品',
          hasAll: true,
          primaryKey: 'product_id',
          tables: [ { name: 'product' } ],
          levels: [
            {
              name: '[Product].[(All Products)]',
              caption: '(All Products)',
              role: AggregationRole.level,
              memberCaption: '[Product].[(All Products)].[MEMBER_CAPTION]',
              properties: [],
              levelNumber: 0,
              entity: 'SalesOrder',
              dimension: '[Product]',
              hierarchy: '[Product]'
            },
            {
              __id__: '1e8f6622-6ce2-4187-8ae6-0be581614804',
              column: 'brand_name',
              properties: [],
              name: '[Product].[Brand Name]',
              caption: '品牌',
              uniqueMembers: true,
              nameColumn: null,
              captionColumn: null,
              ordinalColumn: null,
              parentColumn: null,
              nullParentValue: null,
              table: 'product',
              memberCaption: '[Product].[Brand Name].[MEMBER_CAPTION]',
              role: AggregationRole.level,
              levelNumber: 1,
              entity: 'SalesOrder',
              dimension: '[Product]',
              hierarchy: '[Product]'
            },
            {
              __id__: 'c13911a4-d8b2-486e-afc7-894c21079b95',
              column: 'product_id',
              name: '[Product].[Product]',
              caption: '产品',
              nameColumn: 'product_name',
              uniqueMembers: null,
              captionColumn: null,
              ordinalColumn: null,
              parentColumn: null,
              nullParentValue: null,
              table: 'product',
              memberCaption: '[Product].[Product].[MEMBER_CAPTION]',
              role: AggregationRole.level,
              levelNumber: 2,
              entity: 'SalesOrder',
              dimension: '[Product]',
              hierarchy: '[Product]',
              properties: [
                {
                  column: 'SKU',
                  "caption": "SKU",
                  name: "[Product].[SKU]"
                },
                {
                  column: 'gross_weight',
                  "caption": "Gross Weight",
                  name: "[Product].[Gross Weight]"
                },
                {
                  column: 'shelf_width',
                  "caption": "Shelf Width",
                  name: "[Product].[Shelf Width]"
                }
              ],
            }
          ],
          entity: 'SalesOrder',
          dimension: '[Product]',
          role: AggregationRole.hierarchy,
          memberCaption: '[Product].[MEMBER_CAPTION]'
        }
      ],
      entity: 'SalesOrder',
      memberCaption: '[Product].[MEMBER_CAPTION]',
      role: AggregationRole.dimension
    },
    '[Customer]': {
      entity: 'SalesOrder',
      name: '[Customer]',
      caption: '客户',
      memberCaption: '[Customer].[MEMBER_CAPTION]',
      role: AggregationRole.dimension,
      foreignKey: 'customer_id',
      hierarchies: [
        {
          name: '[Customer]',
          caption: '客户',
          dimension: '[Customer]',
          entity: 'SalesOrder',
          memberCaption: '[Customer].[MEMBER_CAPTION]',
          primaryKeyTable: 'customer',
          primaryKey: 'customer_id',
          tables: [
            {
              name: 'customer'
            }
          ],
          hasAll: true,
          role: AggregationRole.hierarchy,
          levels: [
            {
              entity: 'SalesOrder',
              dimension: '[Customer]',
              hierarchy: '[Customer]',
              levelNumber: 0,
              name: '[Customer].[(All Customers)]',
              caption: '(All Customers)',
              memberCaption: '[Customer].[(All Customers)].[MEMBER_CAPTION]',
              properties: [],
              role: AggregationRole.level
            },
            {
              entity: 'SalesOrder',
              dimension: '[Customer]',
              hierarchy: '[Customer]',
              levelNumber: 1,
              name: '[Customer].[Country]',
              caption: '国家',
              memberCaption: '[Customer].[Country].[MEMBER_CAPTION]',
              column: 'country',
              properties: [],
              role: AggregationRole.level,
              uniqueMembers: true
            },
            {
              entity: 'SalesOrder',
              dimension: '[Customer]',
              hierarchy: '[Customer]',
              levelNumber: 2,
              name: '[Customer].[City]',
              caption: '城市',
              memberCaption: '[Customer].[City].[MEMBER_CAPTION]',
              column: 'city',
              properties: [],
              role: AggregationRole.level,
              uniqueMembers: false
            },
            {
              entity: 'SalesOrder',
              dimension: '[Customer]',
              hierarchy: '[Customer]',
              levelNumber: 3,
              name: '[Customer].[Name]',
              caption: '客户名称',
              memberCaption: '[Customer].[Name].[MEMBER_CAPTION]',
              column: 'fname',
              captionColumn: 'fname',
              properties: [],
              role: AggregationRole.level,
              uniqueMembers: true
            }
          ]
        }
      ]
    },
    [serializeUniqueName('', 'Product Class')]: compileDimensionSchema('SalesOrder', {
      ...PRODUCT_DIMENSION,
      name: 'Product Class',
      foreignKey: 'product_id'
    }),
    '[Payment method]': {
      entity: 'SalesOrder',
      name: '[Payment method]',
      caption: '付款方式',
      memberCaption: '[Payment method].[MEMBER_CAPTION]',
      role: AggregationRole.dimension,
      hierarchies: [
        {
          entity: 'SalesOrder',
          dimension: '[Payment method]',
          name: '[Payment method]',
          caption: '付款方式',
          memberCaption: '[Payment method].[MEMBER_CAPTION]',
          role: AggregationRole.hierarchy,
          hasAll: true,
          allMemberName: 'All',
          allMemberCaption: '所有',
          levels: [
            {
              entity: 'SalesOrder',
              dimension: '[Payment method]',
              hierarchy: '[Payment method]',
              name: '[Payment method].[(All Payment methods)]',
              caption: '(All Payment methods)',
              memberCaption: '[Payment method].[(All Payment methods)].[MEMBER_CAPTION]',
              levelNumber: 0,
              role: AggregationRole.level,
              properties: []
            },
            {
              entity: 'SalesOrder',
              dimension: '[Payment method]',
              hierarchy: '[Payment method]',
              name: '[Payment method].[Payment method]',
              caption: '付款方式',
              memberCaption: '[Payment method].[Payment method].[MEMBER_CAPTION]',
              role: AggregationRole.level,
              column: 'payment_method',
              uniqueMembers: true,
              properties: [],
              levelNumber: 1
            }
          ]
        }
      ]
    },
    Cost: {
      __id__: 'a1eebb49-c622-455f-b43e-f35764757e2f',
      aggregator: 'sum',
      caption: '成本',
      column: 'store_cost',
      name: 'Cost',
      role: AggregationRole.measure
    } as EntityProperty,
    Sales: {
      __id__: '1c05abfc-56e1-46c8-a312-01a4915b1ff9',
      aggregator: 'sum',
      caption: '销售额',
      column: 'store_sales',
      name: 'Sales',
      role: AggregationRole.measure
    } as EntityProperty,
    Profit: {
      __id__: 'bmSRyRTE8h',
      calculationType: 'Calculated',
      dataType: 'number',
      dimension: 'Measures',
      formula: '`sales_fact`.`store_sales` - `sales_fact`.`store_cost`',
      caption: '利润',
      name: 'Profit',
      properties: [],
      role: AggregationRole.measure,
      visible: true,
      aggregator: 'SUM'
    } as CalculationProperty,
  },
  semantics: EntitySemantics.aggregate,
  syntax: undefined
}

export const INDICATORS: Indicator[] = [
  {
    id: 'I1',
    /**
     * 业务编码
     */
    code: 'I1',
    /**
     * 名称
     */
    name: '指标1',

    /**
     * 模型实体
     */
    entity: 'SalesOrder',
    /**
     * 自由维度
     */
    dimensions: ['[Time]'],
    /**
     * 过滤器
     */
    filters: [
      {
        dimension: {
          dimension: '[Product]'
        },
        members: [
          {
            key: '[Excel].[Excel Monthly Auto Magazine]'
          },
          {
            key: 'CDR'
          }
        ]
      },

      {
        dimension: {
          dimension: '[Customer]'
        },
        members: [
          {
            key: '[USA].[San Francisco]'
          }
        ]
      }
    ],
    /**
     * 度量
     */
    measure: 'Sales',
    /**
     * 单位
     */
    unit: 'RMB'
  } as Indicator,

  {
    id: 'I2',
    code: 'I2',
    name: '指标2',
    entity: 'SalesOrder',
    dimensions: ['[Time]'],
    filters: [
      {
        dimension: {
          dimension: '[Product]'
        },
        members: [
          {
            key: '[Excel].[Excel Monthly Auto Magazine]'
          },
          {
            key: 'CDR'
          }
        ]
      },

      {
        dimension: {
          dimension: '[Customer]'
        },
        members: [
          {
            key: '[USA]'
          }
        ],
        exclude: true
      }
    ],
    measure: 'Sales',
    unit: 'RMB'
  },

  {
    id: 'I3',
    code: 'I3',
    name: '指标3',
    entity: 'SalesOrder',
    dimensions: ['[Time]'],
    filters: [
      {
        dimension: {
          dimension: '[Product]'
        },
        members: [
          {
            key: '[Excel].[Excel Monthly Auto Magazine]'
          },
          {
            key: 'CDR'
          }
        ]
      },

      {
        dimension: {
          dimension: '[Customer]'
        },
        members: [
          {
            key: '[USA]'
          }
        ],
        exclude: true
      }
    ],
    formula: `[Measures].[Sales] - [Measures].[Cost]`,
    aggregator: 'SUM',
    unit: 'RMB'
  },

  {
    id: 'I4',
    code: 'I4',
    name: '指标4',
    entity: 'SalesOrder',
    dimensions: ['[Time]'],
    formula: `[Measures].[I3] / [Measures].[I1]`,
    unit: '%'
  },

  {
    id: 'I5',
    /**
     * 业务编码
     */
    code: 'IwithCombinationSlicer',
    /**
     * 名称
     */
    name: '指标(组合切片器)',

    /**
     * 模型实体
     */
    entity: 'SalesOrder',
    /**
     * 自由维度
     */
    dimensions: ['[Time]'],
    /**
     * 过滤器
     */
    filters: [
      {
        filteringLogic: FilteringLogic.And,
        children: [
          {
            filteringLogic: FilteringLogic.Or,
            children: [
              {
                dimension: {
                  dimension: '[Product]'
                },
                members: [
                  {
                    key: '[Excel].[Excel Monthly Auto Magazine]'
                  }
                ]
              },
              {
                dimension: {
                  dimension: '[Product]'
                },
                members: [
                  {
                    key: 'CDR'
                  }
                ]
              }
            ]
          },
          {
            filteringLogic: FilteringLogic.And,
            children: [
              {
                dimension: {
                  dimension: '[Customer]'
                },
                members: [
                  {
                    key: '[USA]'
                  }
                ]
              },
              {
                dimension: {
                  dimension: '[Customer]'
                },
                members: [
                  {
                    key: '[USA].[San Francisco]'
                  }
                ],
                exclude: true
              }
            ]
          }
        ]
      } as IAdvancedFilter,
    ],
    /**
     * 度量
     */
    measure: 'Sales',
    /**
     * 单位
     */
    unit: '¥'
  },

  {
    id: 'I6',
    /**
     * 业务编码
     */
    code: 'IwithAllMember',
    /**
     * 名称
     */
    name: '指标(All成员)',

    /**
     * 模型实体
     */
    entity: 'SalesOrder',
    /**
     * 自由维度
     */
    dimensions: ['[Time]'],
    /**
     * 过滤器
     */
    filters: [
      {
        dimension: {
          dimension: '[Product]'
        },
        members: [
          {
            key: '[Excel].[Excel Monthly Auto Magazine]'
          },
          {
            key: 'CDR'
          }
        ]
      },
      {
        dimension: {
          dimension: '[Customer]'
        },
        members: [
          {
            key: '[(All)]'
          }
        ]
      },
    ],
    /**
     * 度量
     */
    measure: 'Sales',
    /**
     * 单位
     */
    unit: '¥'
  },

  {
    id: 'I7',
    /**
     * 业务编码
     */
    code: 'IwithCount',
    /**
     * 名称
     */
    name: '指标(计数成员个数)',
    type: IndicatorType.DERIVE,
    /**
     * 模型实体
     */
    entity: 'SalesOrder',
    /**
     * 自由维度
     */
    dimensions: ['[Time]'],
    /**
     * 过滤器
     */
    filters: [
      {
        dimension: {
          dimension: '[Product]'
        },
        members: [
          {
            key: '[Excel].[Excel Monthly Auto Magazine]'
          },
          {
            key: 'CDR'
          }
        ]
      }
    ],
    formula: `[Customer]`,
    aggregator: 'distinct-count',
    /**
     * 单位
     */
    unit: '个'
  },
]

INDICATORS.forEach((indicator) => {
  mapIndicatorToMeasures(indicator).forEach((measure) => {
    ENTITY_TYPE_SALESORDER.properties[measure.name] = {
      ...measure,
      role: AggregationRole.measure
    }
  })
})

export const SCHEMA: Schema = {
  name: 'Sales',
  dimensions: [SHARED_DIMENSION_CUSTOMER, SHARED_DIMENSION_TIME, PRODUCT_DIMENSION],
  cubes: [CUBE_SALESORDER],
  indicators: INDICATORS
}
