import {
  AgentType,
  ChartDataZoomType,
  ChartDimensionRoleType,
  ChartMeasureRoleType,
  ChartOptions,
  ChartOrient,
  OrderDirection,
  ReferenceLineAggregation,
  ReferenceLineType,
  ReferenceLineValueType,
  SemanticModel,
  Syntax
} from '@metad/ocap-core'

export const DUCKDB_WASM_MODEL: SemanticModel = {
  name: 'WASM',
  type: 'SQL',
  agentType: AgentType.Wasm,
  syntax: Syntax.SQL,
  dialect: 'duckdb',
  catalog: 'main',
  tables: [
    {
      name: 'Countries',
      type: 'csv',
      sourceUrl: window.location.origin + '/assets/data/ISO-3166-Countries.csv',
      delimiter: ','
    },

    {
      name: 'CountryGDP',
      type: 'csv',
      sourceUrl: window.location.origin + '/assets/data/gdp.csv'
      //`https://cdn.jsdelivr.net/gh/curran/data@gh-pages/worldFactbook/GDPPerCapita.csv`
    },
    {
      name: 'UserData',
      type: 'parquet',
      sourceUrl: window.location.origin + '/assets/data/userdata1.parquet'
      //'https://cdn.jsdelivr.net/gh/Teradata/kylo@master/samples/sample-data/parquet/userdata1.parquet'
    },
    {
      name: 'HREmployeeAttrition',
      type: 'csv',
      sourceUrl: window.location.origin + '/assets/data/HR-Employee-Attrition.csv'
      // 'https://cdn.jsdelivr.net/gh/ashutoshtyagixyz/HR-Employee-Attrition@main/HR-Employee-Attrition.csv'
    }
    // {
    //   name: 'AdventureWorksSales',
    //   type: 'excel',
    //   sourceUrl: '/assets/data/AdventureWorks%20Sales.xlsx',
    //   // sourceUrl: 'https://raw.githubusercontent.com/microsoft/powerbi-desktop-samples/main/AdventureWorks%20Sales%20Sample/AdventureWorks%20Sales.xlsx',
    //   sheets: [
    //     { sheetName: 'Sales Order_data', tableName: 'adw_sales_order' },
    //     { sheetName: 'Sales Territory_data', tableName: 'adw_sales_territory' },
    //     { sheetName: 'Sales_data', tableName: 'adw_sales' },
    //     { sheetName: 'Reseller_data', tableName: 'adw_reseller' },
    //     { sheetName: 'Date_data', tableName: 'adw_date' },
    //     { sheetName: 'Product_data', tableName: 'adw_product' },
    //     { sheetName: 'Customer_data', tableName: 'adw_customer' }
    //   ]
    // }
  ],
  schema: {
    name: 'duckdb',
    dimensions: [],
    cubes: [
      {
        name: 'Sales',
        defaultMeasure: 'Sales Amount',
        visible: true,
        tables: [
          {
            name: 'adw_sales'
          }
        ],
        dimensions: [
          {
            name: 'Reseller',
            caption: '经销商',
            foreignKey: 'ResellerKey',
            hierarchies: [
              {
                name: '',
                caption: '经销商',
                tables: [{ name: 'adw_reseller' }],
                primaryKey: 'ResellerKey',
                levels: [
                  {
                    name: 'Business Type',
                    caption: '业务类型',
                    column: 'Business Type'
                  },
                  {
                    name: 'Reseller Name',
                    caption: '经销商',
                    column: 'ResellerKey',
                    nameColumn: 'Reseller'
                  }
                ]
              }
            ]
          }
        ],
        measures: [
          {
            name: 'Sales Amount',
            column: 'Sales Amount',
            caption: '销售额'
          }
        ]
      },
      {
        name: 'UserData',
        defaultMeasure: 'salary',
        visible: true,
        tables: [
          {
            name: 'UserData'
          }
        ],
        dimensions: [
          {
            name: 'Country',
            caption: '国家',
            hierarchies: [
              {
                name: '',
                levels: [
                  {
                    name: 'Name',
                    column: 'country'
                  }
                ]
              }
            ]
          },
          {
            name: 'Gender',
            caption: '性别',
            hierarchies: [
              {
                name: '',
                levels: [
                  {
                    name: 'Name',
                    column: 'gender'
                  }
                ]
              }
            ]
          }
        ],
        measures: [
          {
            name: 'salary',
            column: 'salary',
            caption: '薪金'
          }
        ]
      },
      {
        name: 'HREmployeeAttrition',
        defaultMeasure: 'EnvironmentSatisfaction',
        visible: true,
        tables: [{ name: 'HREmployeeAttrition' }],
        dimensions: [
          {
            name: 'Department',
            caption: '部门',
            hierarchies: [
              {
                name: '',
                levels: [
                  {
                    name: 'Name',
                    column: 'Department'
                  }
                ]
              }
            ]
          },
          {
            name: 'Job Role',
            caption: '职位',
            hierarchies: [
              {
                name: '',
                levels: [
                  {
                    name: 'Name',
                    column: 'JobRole'
                  }
                ]
              }
            ]
          }
        ],
        measures: [
          {
            name: 'EnvironmentSatisfaction',
            caption: '环境满意度',
            column: 'EnvironmentSatisfaction'
          }
        ]
      },
      {
        name: 'CountryGDP',
        defaultMeasure: 'GDP',
        visible: true,
        tables: [{ name: 'CountryGDP' }],
        dimensions: [
          {
            name: 'Country',
            caption: '国家',
            foreignKey: 'Country Code',
            hierarchies: [
              {
                name: '',
                tables: [
                  {
                    name: 'Countries'
                  }
                ],
                primaryKey: 'alpha-3',
                levels: [
                  {
                    name: 'Region',
                    caption: '区域',
                    column: 'region'
                  },
                  {
                    name: 'Name',
                    caption: '国家',
                    column: 'name'
                  }
                ]
              }
            ]
          },
          {
            name: 'Time',
            caption: '时间',
            hierarchies: [
              {
                name: '',
                levels: [
                  {
                    name: 'Year',
                    caption: '年',
                    column: 'Year',
                    type: 'Integer'
                  }
                ]
              }
            ]
          }
        ],
        measures: [
          {
            name: 'GDP',
            caption: '国民生产总值',
            column: 'Value'
          }
        ]
      }
    ]
  }
}

export const CARTESIAN_CARDS = [
  {
    title: 'Sales Order Pie',
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'SalesOrder',
      chartAnnotation: {
        chartType: {
          type: 'Pie'
        },
        dimensions: [
          {
            dimension: '[productCategory]'
          }
        ],
        measures: [
          {
            dimension: 'Measures',
            measure: 'sales'
          }
        ]
      }
    },
    chartSettings: {},
    chartOptions: {} as ChartOptions
  },
  {
    title: 'Sales Order Bar',
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'SalesOrder',
      chartAnnotation: {
        chartType: {
          type: 'Scatter3D'
        },
        dimensions: [
          {
            dimension: 'product',
            role: ChartDimensionRoleType.Stacked
          },
          {
            dimension: 'productCategory'
          }
        ],
        measures: [
          {
            dimension: 'Measures',
            measure: 'sales'
          },
          {
            dimension: 'Measures',
            measure: 'quantity',
            role: ChartMeasureRoleType.Size
          }
        ]
      }
    },
    chartSettings: {},
    chartOptions: {} as ChartOptions
  },
  {
    title: 'Sales Order Bar',
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'SalesOrder',
      chartAnnotation: {
        chartType: {
          type: 'Bar'
        },
        dimensions: [
          {
            dimension: 'product',
            role: ChartDimensionRoleType.Stacked
          },
          {
            dimension: 'productCategory'
          }
        ],
        measures: [
          {
            dimension: 'Measures',
            measure: 'sales'
          }
        ]
      }
    }
  },
  {
    title: 'Purchase Order Bar',
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'SalesOrder',
      chartAnnotation: {
        chartType: {
          type: 'Bar'
        },
        dimensions: [
          {
            dimension: 'product'
          },
          {
            dimension: 'productCategory'
          }
        ],
        measures: [
          {
            dimension: 'Measures',
            measure: 'sales',
            palette: {
              name: 'PuOr',
              pattern: 1
            },
            referenceLines: [
              {
                caption: 'Sales Average',
                type: ReferenceLineType.markLine,
                valueType: ReferenceLineValueType.dynamic,
                aggregation: ReferenceLineAggregation.average
              }
            ]
          }
        ]
      }
    },
    chartSettings: {},
    chartOptions: {} as ChartOptions
  },
  {
    title: 'Sales Order Line',
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'SalesOrder',
      chartAnnotation: {
        chartType: {
          type: 'Line'
        },
        dimensions: [
          {
            dimension: 'product'
          },
          {
            dimension: 'productCategory',
            role: ChartDimensionRoleType.Trellis
          }
        ],
        measures: [
          {
            dimension: 'Measures',
            measure: 'sales'
          }
        ]
      }
    },
    chartSettings: {
      universalTransition: true
    }
  },
  {
    title: 'Sales Order Two Measures',
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'SalesOrder',
      chartAnnotation: {
        chartType: {
          type: 'Bar'
        },
        dimensions: [
          {
            dimension: 'product'
          },
          {
            dimension: 'productCategory',
            role: ChartDimensionRoleType.Stacked
          }
        ],
        measures: [
          {
            dimension: 'Measures',
            measure: 'sales'
          },
          {
            dimension: 'Measures',
            measure: 'quantity'
          }
        ]
      }
    },
    chartSettings: {
      universalTransition: true
    },
    chartOptions: {
      tooltip: {
        trigger: 'axis'
      }
    }
  },
  {
    title: 'Sales Order Treemap',
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'SalesOrder',
      chartAnnotation: {
        chartType: {
          type: 'Treemap'
        },
        dimensions: [
          {
            dimension: 'productCategory'
          },
          {
            dimension: 'product'
          }
        ],
        measures: [
          {
            dimension: 'Measures',
            measure: 'sales'
          }
        ]
      }
    },
    chartSettings: {
      universalTransition: true
    }
  },
  {
    title: 'Sales Order Heatmap',
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'SalesOrder',
      chartAnnotation: {
        chartType: {
          type: 'Heatmap'
        },
        dimensions: [
          {
            dimension: 'productCategory'
          },
          {
            dimension: 'product',
            role: ChartDimensionRoleType.Category2
          }
        ],
        measures: [
          {
            dimension: 'Measures',
            measure: 'sales',
            palette: {
              name: 'PuOr'
            }
          }
        ]
      }
    },
    chartSettings: {
      universalTransition: true
    }
  },
  {
    title: 'Sales Order Scatter',
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'SalesOrder',
      chartAnnotation: {
        chartType: {
          type: 'Scatter'
        },
        dimensions: [
          {
            dimension: 'productCategory',
            role: ChartDimensionRoleType.Trellis
          },
          {
            dimension: 'product'
          }
        ],
        measures: [
          {
            dimension: 'Measures',
            measure: 'sales',
            palette: {
              name: 'PuOr'
            }
          },
          {
            dimension: 'Measures',
            measure: 'quantity'
            // role: ChartMeasureRoleType.Size
          }
        ]
      }
    },
    chartSettings: {
      universalTransition: true
    }
  },
  {
    title: 'Sales Order Sankey',
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'SalesOrder',
      chartAnnotation: {
        chartType: {
          type: 'Sankey'
        },
        dimensions: [
          {
            dimension: 'productCategory'
          },
          {
            dimension: 'product'
          }
        ],
        measures: [
          {
            dimension: 'Measures',
            measure: 'sales'
          }
        ]
      }
    },
    chartSettings: {
      universalTransition: true
    }
  }
]

export const ANALYTICAL_CARDS = [
  {
    title: 'UserData Stacked Bar',
    dataSettings: {
      dataSource: 'WASM',
      entitySet: 'UserData',
      chartAnnotation: {
        chartType: {
          type: 'Bar'
        },
        dimensions: [
          {
            dimension: '[Country]',
            zeroSuppression: true
          },
          {
            dimension: '[Gender]',
            role: ChartDimensionRoleType.Stacked
          }
        ],
        measures: [
          {
            dimension: 'Measures',
            measure: 'salary',
            formatting: {
              shortNumber: true
            }
          }
        ]
      },
      presentationVariant: {
        sortOrder: [
          {
            by: 'salary',
            order: OrderDirection.DESC
          }
        ]
      }
    },
    chartSettings: {
      locale: 'zh-Hans',
      digitInfo: '0.3',
      chartTypes: [
        {
          name: 'Horizontal Bar',
          type: 'Bar',
          orient: ChartOrient.horizontal
        }
      ]
    },
    chartOptions: {
      dataZoom: {
        type: ChartDataZoomType.inside
      }
    } as ChartOptions
  },
  {
    title: 'HREmployeeAttrition Stacked Bar',
    dataSettings: {
      dataSource: 'WASM',
      entitySet: 'HREmployeeAttrition',
      chartAnnotation: {
        chartType: {
          type: 'Bar'
        },
        dimensions: [
          {
            dimension: '[Department]',
            zeroSuppression: true
          },
          {
            dimension: '[Job Role]',
            role: ChartDimensionRoleType.Stacked
          }
        ],
        measures: [
          {
            dimension: 'Measures',
            measure: 'EnvironmentSatisfaction',
            formatting: {
              shortNumber: true
            }
          }
        ]
      }
      // presentationVariant: {
      //   sortOrder: [
      //     {
      //       by: 'salary',
      //       order: OrderDirection.DESC
      //     }
      //   ]
      // }
    },
    chartSettings: {},
    chartOptions: {
      dataZoom: {
        type: ChartDataZoomType.inside
      }
    } as ChartOptions
  },
  {
    title: 'Country GDP',
    dataSettings: {
      dataSource: 'WASM',
      entitySet: 'CountryGDP',
      chartAnnotation: {
        chartType: {
          type: 'GeoMap',
          map: 'World',
          mapUrl: window.location.origin + '/assets/data/countries.geo.json', // `https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json`,
          projection: 'NaturalEarth1'
        },
        dimensions: [
          {
            dimension: '[Country]',
            level: '[Country].[Name]'
          }
        ],
        measures: [
          {
            dimension: 'Measures',
            measure: 'GDP',
            formatting: {
              shortNumber: true
            }
          }
        ]
      }
    },
    chartSettings: {},
    chartOptions: {
      visualMaps: [
        {
          show: true,
          text: ['富', '贫'],
          color: ['#bf444c', '#d88273', '#f6efa6']
          // inRange: {
          //   color: [
          //     'red',
          //     'black'
          //   ],
          //   symbolSize: [60, 200]
          // }
        }
      ]
    }
  }
]

export const SALES_CHARTS = [
  {
    title: 'Reseller Sales',
    dataSettings: {
      dataSource: 'WASM',
      entitySet: 'Sales',
      chartAnnotation: {
        chartType: {
          type: 'Bar'
        },
        dimensions: [
          {
            dimension: '[Reseller]'
          }
        ],
        measures: [
          {
            dimension: 'Measures',
            measure: 'Sales Amount',
            formatting: {
              shortNumber: true
            }
          }
        ]
      },
      presentationVariant: {
        sortOrder: [
          {
            by: 'Sales Amount',
            order: OrderDirection.DESC
          }
        ]
      }
    },
    chartSettings: {
      universalTransition: true
    },
    chartOptions: {
      seriesStyle: {
        selectedMode: 'single'
      },
      dataZoom: {
        type: ChartDataZoomType.inside
      }
    } as ChartOptions
  }
]
