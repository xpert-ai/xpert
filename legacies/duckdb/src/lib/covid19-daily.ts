import {
  AgentType,
  ChartDataZoomType,
  ChartDimensionRoleType,
  ChartMeasureRoleType,
  ChartOptions,
  C_MEASURES,
  OrderDirection,
  SemanticModel,
  Syntax
} from '@metad/ocap-core'

export const DUCKDB_COVID19_DAILY_MODEL: SemanticModel = {
  name: 'Covid19',
  type: 'SQL',
  agentType: AgentType.Wasm,
  syntax: Syntax.SQL,
  dialect: 'duckdb',
  catalog: 'covid',
  tables: [
    {
      name: 'Countries',
      type: 'csv',
      sourceUrl: window.location.origin + '/assets/data/ISO-3166-Countries.csv',
      delimiter: ','
    },
    {
      name: 'CsseCovid19Daily',
      type: 'csv',
      sourceUrl: window.location.origin + '/assets/data/CsseCovid19Daily_05-18-2022.csv',
      delimiter: ','
    }
  ],
  schema: {
    name: 'Covid19Daily',
    dimensions: [
      {
        name: 'Country',
        caption: '国家',
        hierarchies: [
          {
            name: '',
            caption: '国家',
            tables: [
              {
                name: 'Countries'
              }
            ],
            primaryKey: 'name',
            hasAll: true,
            levels: [
              {
                name: 'Region',
                column: 'region',
                caption: '地区'
              },
              {
                name: 'Sub Region',
                column: 'sub-region',
                caption: '子区域'
              },
              {
                name: 'Name',
                column: 'name',
                caption: '国家'
              }
            ]
          },
          {
            name: 'Region',
            caption: '地区',
            tables: [
              {
                name: 'Countries'
              }
            ],
            primaryKey: 'name',
            hasAll: true,
            levels: [
              {
                name: 'Region',
                column: 'region',
                caption: '地区'
              },
              {
                name: 'Name',
                column: 'name',
                caption: '国家'
              }
            ]
          }
        ]
      }
    ],
    cubes: [
      {
        name: 'Covid19Daily',
        defaultMeasure: 'Confirmed',
        visible: true,
        tables: [
          {
            name: 'CsseCovid19Daily'
          }
        ],
        dimensionUsages: [
          {
            name: 'Country',
            source: 'Country',
            foreignKey: 'Country_Region'
          }
        ],
        dimensions: [
          {
            name: 'Country Region',
            caption: '国家',
            hierarchies: [
              {
                name: '',
                levels: [
                  {
                    name: 'Name',
                    caption: '名称',
                    column: 'Country_Region'
                  },
                  {
                    name: 'Province State',
                    caption: 'Province State',
                    column: 'Province_State'
                  }
                ]
              }
            ]
          },
          {
            name: 'Admin',
            caption: '管理员',
            hierarchies: [
              {
                name: '',
                levels: [
                  {
                    name: 'Name',
                    column: 'Admin2'
                  }
                ]
              }
            ]
          }
        ],
        measures: [
          {
            name: 'Confirmed',
            column: 'Confirmed',
            caption: '确诊'
          },
          {
            name: 'Deaths',
            column: 'Deaths',
            caption: '死亡'
          },
          {
            name: 'CaseFatalityRatio',
            column: 'Case_Fatality_Ratio',
            caption: '病死率'
          }
        ]
      }
    ]
  }
}

export const COVID19_DAILY_CHARTS = [
  {
    type: 'SmartFilter',
    dataSettings: {
      dataSource: 'Covid19',
      entitySet: 'Covid19Daily'
    },
    dimension: {
      dimension: '[Country]'
    },
    options: {
      defaultMembers: [
        { value: '[Africa]' }
      ],
      autoActiveFirst: true
    }
  },
  {
    type: 'MemberTree',
    dataSettings: {
      dataSource: 'Covid19',
      entitySet: 'Covid19Daily'
    },
    dimension: {
      dimension: '[Country]'
    },
    options: {
      // defaultMembers: [
      //   { value: '[Africa]' }
      // ],
      autoActiveFirst: true
    }
  },
  {
    title: 'Csse Covid-19 Daily',
    dataSettings: {
      dataSource: 'Covid19',
      entitySet: 'Covid19Daily',
      chartAnnotation: {
        chartType: {
          type: 'Bar'
        },
        dimensions: [
          {
            dimension: '[Country]'
          }
        ],
        measures: [
          {
            dimension: 'Measures',
            measure: 'Confirmed',
            formatting: {
              shortNumber: true
            }
          },
          {
            dimension: 'Measures',
            measure: 'Deaths'
          },
          {
            dimension: 'Measures',
            measure: 'CaseFatalityRatio',
            role: ChartMeasureRoleType.Axis2,
            formatting: {
              unit: '%'
            }
          }
        ]
      },
      presentationVariant: {
        sortOrder: [
          {
            by: 'Confirmed',
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
  },
  
  {
    title: 'Covid19Daily Trellis',
    dataSettings: {
      dataSource: 'Covid19',
      entitySet: 'Covid19Daily',
      chartAnnotation: {
        chartType: {
          type: 'Bar'
        },
        dimensions: [
          {
            dimension: '[Country Region]'
          },
          {
            dimension: '[Country]',
            hierarchy: '[Country]',
            level: '[Country].[Region]',
            role: ChartDimensionRoleType.Trellis
          }
        ],
        measures: [
          {
            dimension: 'Measures',
            measure: 'Confirmed',
            palette: {
              name: 'PuOr'
            },
            formatting: {
              shortNumber: true
            }
          },
          {
            dimension: 'Measures',
            measure: 'Deaths'
            // role: ChartMeasureRoleType.Size
          }
        ]
      }
    },
    chartSettings: {
      universalTransition: true,
      chartTypes: [
        {
          type: 'Line'
        }
      ]
    }
  },
  {
    title: 'Hierarchy Tree Table',
    dataSettings: {
      dataSource: 'Covid19',
      entitySet: 'Covid19Daily',
      analytics: {
        rows: [
          {
            dimension: '[Country]',
            hierarchy: '[Country]',
            level: '[Country].[Name]',
            displayHierarchy: true,
            members: [
              {
                value: '[#]'
              }
            ],
            exclude: true
          }
        ],
        columns: [
          {
            dimension: C_MEASURES,
            measure: 'Confirmed',
            palette: {
              name: 'YlGn'
            },
            formatting: {
              digitsInfo: '0.0',
              unit: 'p'
            },
            order: 'desc',
            bar: true
          }
        ]
      }
    },
    columns: {},
    options: {
      showToolbar: true,
      grid: true,
      sortable: true,
      initialRowLevel: 2,
      initialColumnLevel: 2,
      selectable: true
      // sticky: true
    }
  }
]
