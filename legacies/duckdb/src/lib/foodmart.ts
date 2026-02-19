import {
  AgentType,
  ChartDimensionRoleType,
  ChartOptions,
  C_MEASURES,
  SemanticModel,
  Semantics,
  Syntax
} from '@metad/ocap-core'

export const DUCKDB_FOODMART_MODEL: SemanticModel = {
  name: 'FOODMART',
  type: 'SQL',
  agentType: AgentType.Wasm,
  syntax: Syntax.SQL,
  dialect: 'duckdb',
  catalog: 'foodmart',
  tables: [
    {
      name: 'product',
      type: 'csv',
      sourceUrl: window.location.origin + '/assets/data/foodmart/product.csv',
      delimiter: ','
    },
    {
      name: 'sales_fact',
      type: 'csv',
      sourceUrl: window.location.origin + '/assets/data/foodmart/sales_fact.csv',
      delimiter: ',',
      batchSize: 10000
    },

    {
      name: 'product_class',
      type: 'csv',
      sourceUrl: window.location.origin + '/assets/data/foodmart/product_class.csv',
      delimiter: ','
    },
    {
      name: 'time_by_day',
      type: 'csv',
      sourceUrl: window.location.origin + '/assets/data/foodmart/time_by_day.csv',
      delimiter: ','
    },
    {
      name: 'store',
      type: 'csv',
      sourceUrl: window.location.origin + '/assets/data/foodmart/store.csv',
      delimiter: ','
    }
  ],
  schema: {
    name: 'Foodmart',
    dimensions: [
      {
        __id__: '590d2e4a-ef71-49e4-b53f-36100cc5b004',
        name: 'Time',
        caption: '日历',
        semantics: {
          semantic: Semantics['Calendar']
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
                  sql: {
                    dialect: 'general',
                    content: `concat("the_year", '-', "quarter")`
                  }
                }
              },
              {
                __id__: 'cc0f564e-73ef-4761-bac7-2daa83cb7487',
                column: 'the_month',
                name: 'Month',
                caption: '月',
                levelType: 'TimeMonths',
                semantics: {
                  semantic: Semantics['Calendar.Month'],
                  formatter: "[yyyy].['Q'Q].[M]"
                },
                captionColumn: 'the_month',
                captionExpression: {
                  sql: {
                    dialect: 'general',
                    content: `concat("the_year", '-', "the_month")`
                  }
                },
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
                name: 'Year',
                caption: '年',
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
      },
      {
        __id__: '3571a32a-1365-4e7f-875e-6520537f5b48',
        name: 'Product',
        caption: '产品',
        hierarchies: [
          {
            __id__: '8531da03-2485-4281-ba4f-678c0fb25e15',
            name: '',
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
                    propertyExpression: {
                      sql: { dialect: null, content: null }
                    },
                    column: 'SKU',
                    name: 'SKU'
                  },
                  {
                    propertyExpression: {
                      sql: { dialect: null, content: null }
                    },
                    column: 'gross_weight',
                    name: 'Gross Weight'
                  },
                  {
                    propertyExpression: {
                      sql: { dialect: null, content: null }
                    },
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
        __id__: 'eb021021-67d9-47de-8064-00aa3c48406d',
        name: 'Store',
        caption: '门店',
        hierarchies: [
          {
            __id__: 'dfeac13b-25c7-4965-897a-e3360daca284',
            name: '',
            caption: '门店',
            hasAll: true,
            primaryKey: 'store_id',
            tables: [{ name: 'store' }],
            levels: [
              {
                __id__: '8d722b98-890d-4da6-a02c-ff4dd06c765a',
                column: 'store_country',
                name: 'Country',
                caption: '国家',
                uniqueMembers: true
              },
              {
                __id__: 'f938b36a-52d1-4ec4-b366-7783ebd219b7',
                column: 'store_state',
                name: 'State',
                caption: '州',
                uniqueMembers: true
              },
              {
                __id__: '26d29c49-1ce4-497e-b875-6c5cb59f8563',
                column: 'store_city',
                name: 'City',
                caption: '城市'
              },
              {
                __id__: 'f55d7ed2-9b7d-446c-a310-031aac140d9d',
                column: 'store_name',
                name: 'Name',
                caption: '门店',
                uniqueMembers: true,
                nameColumn: null,
                captionColumn: null,
                ordinalColumn: null,
                parentColumn: null,
                nullParentValue: null,
                properties: [
                  {
                    name: 'Store Type',
                    column: 'store_type'
                  },
                  {
                    name: 'Store Manager',
                    column: 'store_manager'
                  },
                  {
                    name: 'Store Sqft',
                    column: 'store_sqft'
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        __id__: 'GdMqSsXRlg',
        name: 'Customers',
        caption: '客户',
        hierarchies: [
          {
            __id__: 'CPUm6y9CDL',
            caption: '客户',
            hasAll: true,
            primaryKey: 'customer_id',
            tables: [
              { join: null, name: 'customer' },
              {
                join: { type: 'Inner', fields: [{ leftKey: 'country_id', rightKey: 'location_id' }] },
                name: 'locations'
              }
            ],
            name: '',
            allMemberName: null,
            primaryKeyTable: 'customer',
            defaultMember: null,
            levels: [
              {
                name: 'Country',
                caption: '国家',
                column: 'location_id',
                uniqueMembers: null,
                nameColumn: 'location_name',
                captionColumn: null,
                ordinalColumn: null,
                parentColumn: null,
                nullParentValue: null,
                table: 'locations',
                levelType: null,
                parentChild: null,
                properties: [
                  {
                    name: 'Long',
                    column: 'longitude',
                    propertyExpression: { sql: { dialect: null, content: null } }
                  },
                  {
                    name: 'Lat',
                    column: 'latitude',
                    propertyExpression: { sql: { dialect: null, content: null } }
                  }
                ],
                semantics: null,
                captionExpression: null,
                __id__: 'rdPa4d4P4T'
              },
              {
                name: 'State Province',
                caption: '省市',
                column: 'state_province',
                uniqueMembers: null,
                nameColumn: null,
                captionColumn: null,
                ordinalColumn: null,
                parentColumn: null,
                nullParentValue: null,
                table: 'customer',
                levelType: null,
                parentChild: null,
                properties: [],
                semantics: null,
                captionExpression: null,
                __id__: 'hwEWWvzK60'
              },
              {
                name: 'City',
                caption: '城市',
                column: 'city',
                uniqueMembers: null,
                nameColumn: null,
                captionColumn: null,
                ordinalColumn: null,
                parentColumn: null,
                nullParentValue: null,
                table: 'customer',
                levelType: null,
                parentChild: null,
                properties: [],
                semantics: null,
                captionExpression: null,
                __id__: '0wHSfMK7Ci'
              },
              {
                name: 'Name',
                caption: '客户',
                column: 'customer_id',
                uniqueMembers: null,
                nameColumn: 'fullname',
                captionColumn: null,
                ordinalColumn: null,
                parentColumn: null,
                nullParentValue: null,
                table: 'customer',
                levelType: null,
                parentChild: null,
                semantics: null,
                captionExpression: null,
                __id__: 'PAKSaiknpS',
                properties: [
                  {
                    propertyExpression: {
                      sql: {}
                    },
                    name: 'Gender',
                    column: 'gender'
                  },
                  {
                    propertyExpression: {
                      sql: {}
                    },
                    name: 'Marital Status',
                    column: 'marital_status'
                  },
                  {
                    propertyExpression: {
                      sql: {}
                    },
                    name: 'Education',
                    column: 'education'
                  },
                  {
                    propertyExpression: {
                      sql: {}
                    },
                    name: 'Yearly Income',
                    column: 'yearly_income'
                  }
                ]
              }
            ]
          }
        ],
        column: null,
        foreignKey: null,
        type: null,
        role: null,
        defaultHierarchy: null,
        keyExpression: null,
        semantics: null
      }
    ],
    cubes: [
      {
        __id__: 'a182caa2-f361-44a2-b245-d0cc314f4603',
        name: 'Sales',
        caption: '销售',
        defaultMeasure: 'Sales',
        visible: true,
        tables: [{ name: 'sales_fact' }],
        dimensionUsages: [
          {
            name: 'Time',
            source: 'Time',
            __id__: '22f3cdd3-c6d6-42a1-a312-6d75c7b40d8b',
            foreignKey: 'time_id'
          },
          {
            name: 'Store',
            source: 'Store',
            __id__: 'c00de261-7501-4390-88dd-78f778f5cbda',
            foreignKey: 'store_id'
          },
          {
            name: 'Product',
            source: 'Product',
            __id__: '946add05-8830-4519-aff1-768d4aa17f49',
            foreignKey: 'product_id'
          },
          {
            name: 'Customers',
            source: 'Customers',
            __id__: '946add05-8830-4519-aff1-768d4aa17f50',
            foreignKey: 'customer_id'
          }
        ],
        dimensions: [
          {
            __id__: '0883487e-afdc-439e-9da3-c734a7e44ea7',
            name: 'Promotions',
            foreignKey: 'promotion_id',
            type: '',
            caption: '促销活动',
            hierarchies: [
              {
                __id__: 'c1ae6a6b-29e4-4995-867b-6147cf29f938',
                name: '',
                hasAll: true,
                caption: null,
                allMemberName: null,
                tables: [{ name: 'promotion' }],
                primaryKey: 'promotion_id',
                levels: [
                  {
                    __id__: '725f187e-bf22-4f69-bc3d-ce67db86e236',
                    name: 'Promotion Name',
                    caption: '',
                    column: 'promotion_id',
                    uniqueMembers: true,
                    nameColumn: 'promotion_name'
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
            caption: '销售额',
            formatting: {
              unit: '$'
            }
          },
          {
            __id__: 'a1eebb49-c622-455f-b43e-f35764757e2f',
            name: 'Cost',
            aggregator: 'sum',
            column: 'store_cost',
            caption: '成本',
            formatting: {
              unit: '$'
            }
          },
          {
            __id__: 'a1eebb49-c622-455f-b43e-f35764757e2d',
            name: 'Profit',
            aggregator: 'sum',
            caption: '利润',
            measureExpression: {
              sql: {
                dialect: 'general',
                content: `"store_sales" - "store_cost" - 3.9`
              }
            }
          }
        ],
        calculatedMembers: [
          {
            __id__: '52023f45-6920-4186-b99d-e5c8d1226009',
            name: 'Profit last Period',
            dimension: 'Measures',
            visible: true,
            formula: 'CoalesceEmpty((Measures.[Profit], [Time].PrevMember), Measures.[Profit])',
            caption: 'Profit last Period'
          },
          {
            __id__: '0b4d5ee8-9eb9-4cb2-a328-afa4360039ad',
            name: 'Profit Growth',
            dimension: 'Measures',
            visible: true,
            caption: 'Profit Growth',
            formula: '([Measures].[Profit] - [Measures].[Profit last Period]) / [Measures].[Profit last Period]'
          }
        ]
      }
    ],
    indicators: [
      {
        id: 'I1',
        code: 'I1',
        name: 'ADJ 销售额',
        entity: 'Sales',
        dimensions: ['[Time]'],
        filters: [
          {
            dimension: {
              dimension: '[Product]'
            },
            members: [
              {
                key: '[ADJ]'
              }
            ]
          }
        ],
        measure: 'Sales',
        unit: 'RMB'
      },
      {
        id: 'I2',
        code: 'I2',
        name: 'ADJ 生产成本',
        entity: 'Sales',
        dimensions: ['[Time]'],
        filters: [
          {
            dimension: {
              dimension: '[Product]'
            },
            members: [
              {
                key: '[ADJ]'
              }
            ]
          }
        ],
        measure: 'Cost',
        unit: 'RMB'
      },

      {
        id: 'I3',
        code: 'I3',
        name: 'ADJ 利润',
        entity: 'Sales',
        dimensions: ['[Time]'],
        filters: [
          {
            dimension: {
              dimension: '[Product]'
            },
            members: [
              {
                key: '[ADJ]'
              }
            ]
          }
        ],
        formula: `[Measures].[Sales] - [Measures].[Cost]`,
        aggregator: 'SUM',
        unit: 'RMB'
      },
      {
        id: 'I4',
        code: 'I4',
        name: 'ADJ 利润率',
        entity: 'Sales',
        dimensions: ['[Time]'],
        formula: `[Measures].[I3] / [Measures].[I1]`,
        unit: '%'
      }
    ]
  }
}

export const FOODMART_CHARTS = [
  {
    title: 'Sales',
    dataSettings: {
      dataSource: 'FOODMART',
      entitySet: 'Sales',
      chartAnnotation: {
        chartType: {
          type: 'Bar'
        },
        dimensions: [
          {
            dimension: '[Store]'
          },
          {
            dimension: '[Product]',
            role: ChartDimensionRoleType.Stacked
          }
        ],
        measures: [
          {
            dimension: 'Measures',
            measure: 'Sales'
          }
        ]
      }
    },
    chartSettings: {},
    chartOptions: {
      seriesStyle: {
        selectedMode: 'single'
      }
    } as ChartOptions,
    options: {
      // realtimeLinked: true
    },
  },
  {
    title: 'Sales',
    dataSettings: {
      dataSource: 'FOODMART',
      entitySet: 'Sales',
      chartAnnotation: {
        chartType: {
          type: 'Bar'
        },
        dimensions: [
          {
            dimension: '[Store]',
            level: '[Store].[Country]'
          },
        ],
        measures: [
          {
            dimension: 'Measures',
            measure: 'Sales'
          }
        ]
      }
    },
    chartSettings: {},
    chartOptions: {
      seriesStyle: {
        selectedMode: 'single'
      }
    } as ChartOptions,
    options: {
      realtimeLinked: true
    },
  },
  {
    title: 'Hierarchy Tree Table',
    dataSettings: {
      dataSource: 'FOODMART',
      entitySet: 'Sales',
      analytics: {
        rows: [
          {
            dimension: '[Store]',
            level: '[Store].[City]',
            displayHierarchy: true
          }
        ],
        columns: [
          {
            dimension: '[Time]',
            hierarchy: '[Time]',
            level: '[Time].[Month]',
            displayHierarchy: true,
            members: [
              { value: '[2021].[Q2].[June]', label: '2021 June' }
            ]
          },
          {
            dimension: C_MEASURES,
            measure: 'Sales',
            palette: {
              name: 'YlGn'
            },
            formatting: {
              digitsInfo: '0.1-1',
              currencyCode: 'CNY'
            }
          },
          {
            dimension: C_MEASURES,
            measure: 'Cost',
            palette: {
              name: 'YlOrRd'
            },
            formatting: {
              decimal: 2,
              currencyCode: 'USD'
            }
          }
        ]
      }
    },
    columns: {
    },
    options: {
      showToolbar: true,
      grid: true,
      sortable: true,
      initialRowLevel: 2,
      initialColumnLevel: 2,
      selectable: true
      // sticky: true
    }
  },
  {
    title: 'Hierarchy Tree Table',
    dataSettings: {
      dataSource: 'FOODMART',
      entitySet: 'Sales',
      analytics: {
        rows: [
          {
            dimension: '[Time]',
            hierarchy: '[Time]',
            level: '[Time].[Month]',
            displayHierarchy: true,
          },
        ],
        columns: [
          {
            dimension: '[Store]',
            level: '[Store].[City]',
            displayHierarchy: true
          },
          
          {
            dimension: C_MEASURES,
            measure: 'Sales',
            palette: {
              name: 'YlGn'
            },
            formatting: {
              digitsInfo: '0.1-1',
              currencyCode: 'CNY'
            }
          },
          {
            dimension: C_MEASURES,
            measure: 'Cost',
            palette: {
              name: 'YlOrRd'
            },
            formatting: {
              decimal: 2,
              currencyCode: 'USD'
            }
          }
        ]
      }
    },
    columns: {
    },
    options: {
      showToolbar: true,
      grid: true,
      sortable: true,
      initialRowLevel: 2,
      initialColumnLevel: 2,
      selectable: true
      // sticky: true
    }
  },

  {
    title: 'Hierarchy Tree Table',
    dataSettings: {
      dataSource: 'FOODMART',
      entitySet: 'Sales',
      analytics: {
        rows: [
          {
            dimension: '[Store]',
            level: '[Store].[City]',
            displayHierarchy: true
          }
        ],
        columns: [
          {
            dimension: '[Time]',
            hierarchy: '[Time]',
            level: '[Time].[Quarter]'
          },
          {
            dimension: C_MEASURES,
            members: ['Sales']
          }
        ]
      }
    }
  },

  {
    title: 'Flat Table',
    dataSettings: {
      dataSource: 'FOODMART',
      entitySet: 'Sales',
      analytics: {
        rows: [
          {
            dimension: '[Store]',
            level: '[Store].[Country]'
          },
          {
            dimension: '[Time]',
            hierarchy: '[Time]',
            level: '[Time].[Month]'
          }
        ],
        columns: [
          {
            dimension: C_MEASURES,
            members: ['Sales', 'Cost']
          }
        ]
      }
    },
    options: {
      strip: true,
      grid: true,
      initialRowLevel: 1,
      initialColumnLevel: 1,
      sortable: true,
      sticky: true
    },
    columns: {
      Sales: {
        semantic: {
          style: 'background',
          expression: {
            negative: `{Value} < 200000`
          }
        }
      },
      Cost: {
        semantic: {
          style: 'color',
          expression: {
            negative: `{Value} > 200000`
          }
        }
      }
    }
  },

  {
    title: 'Flat Table',
    dataSettings: {
      dataSource: 'FOODMART',
      entitySet: 'Sales',
      analytics: {
        rows: [
          {
            dimension: '[Store]',
            level: '[Store].[Country]',
          }
        ],
        columns: [
          {
            dimension: '[Time]',
            hierarchy: '[Time]',
            level: '[Time].[Quarter]',
          },
          {
            dimension: C_MEASURES,
            members: ['Sales']
          }
        ]
      }
    },
    columns: {
      Sales: {
        semantic: {
          style: 'background',
          expression: {
            negative: `{Value} < 100000`
          }
        }
      },
      Cost: {
        semantic: {
          style: 'color',
          expression: {
            negative: `{Value} > 200000`
          }
        }
      }
    },
    options: {
      strip: true,
      grid: true,
      initialRowLevel: 1,
      initialColumnLevel: 1,
      sortable: true
    }
  },

  {
    title: 'Heatmap Table',
    dataSettings: {
      dataSource: 'FOODMART',
      entitySet: 'Sales',
      analytics: {
        rows: [
          {
            dimension: '[Store]',
            level: '[Store].[City]'
          }
        ],
        columns: [
          {
            dimension: '[Time]',
            hierarchy: '[Time]',
            level: '[Time].[Month]'
          },
          {
            dimension: C_MEASURES,
            measure: 'Sales',
            palette: {
              name: 'YlOrRd'
            }
          }
        ]
      }
    },
    columns: {
    },
    options: {
      strip: true,
      grid: true,
      initialRowLevel: 1,
      initialColumnLevel: 1,
      sortable: true
    }
  },

  {
    title: 'Bar Table',
    dataSettings: {
      dataSource: 'FOODMART',
      entitySet: 'Sales',
      analytics: {
        rows: [
          {
            dimension: '[Store]',
            level: '[Store].[Country]'
          },
          {
            dimension: '[Time]',
            hierarchy: '[Time]',
            level: '[Time].[Year]'
          }
        ],
        columns: [
          {
            dimension: C_MEASURES,
            // members: ['Sales', 'Cost', 'Profit'],
            measure: 'Sales',
            palette: {
              name: 'YlOrRd'
            }
          }
        ]
      }
    },
    options: {
      strip: true,
      grid: true,
      initialRowLevel: 1,
      initialColumnLevel: 1,
      sortable: true,
      selectable: true
    },
    columns: {
      Sales: {
        bar: true,
            palette: {
              name: 'YlOrRd'
            }
      },
      Cost: {
        bar: true,
        semantic: {
          style: 'color',
          expression: {
            negative: `{Value} > 200000`
          }
        }
      },
      Profit: {
        bar: true,
      }
    }
  },

  {
    title: 'Flat Table - No Columns',
    dataSettings: {
      dataSource: 'FOODMART',
      entitySet: 'Sales',
      analytics: {
        rows: [
          {
            dimension: '[Store]',
            level: '[Store].[Country]'
          },
          {
            dimension: '[Time]',
            hierarchy: '[Time]',
            level: '[Time].[Year]'
          }
        ],
      }
    },
    options: {
      showToolbar: true,
      strip: true,
      grid: true,
      initialRowLevel: 1,
      initialColumnLevel: 1,
      sortable: true,
      selectable: true
    },
    columns: {
    }
  },

  {
    title: 'Flat Table - No Rows',
    dataSettings: {
      dataSource: 'FOODMART',
      entitySet: 'Sales',
      analytics: {
        columns: [
          {
            dimension: '[Store]',
            level: '[Store].[Country]'
          },
          {
            dimension: '[Time]',
            hierarchy: '[Time]',
            level: '[Time].[Year]'
          }
        ],
      }
    },
    options: {
      showToolbar: true,
      strip: true,
      grid: true,
      initialRowLevel: 1,
      initialColumnLevel: 1,
      sortable: true,
      selectable: true
    },
    columns: {
    }
  },
]
