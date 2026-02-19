import { AgentType, ChartOrient, OrderDirection, SemanticModel, Syntax } from '@metad/ocap-core'

export const DUCKDB_UNEMPLOYMENT_MODEL: SemanticModel = {
  name: 'UnemploymentModel',
  type: 'SQL',
  agentType: AgentType.Wasm,
  syntax: Syntax.SQL,
  dialect: 'duckdb',
  catalog: 'main',
  tables: [
    {
      name: 'unemployment',
      type: 'csv',
      sourceUrl: window.location.origin + '/assets/data/us/unemployment-by-county-us.csv',
      delimiter: ',',
      // batchSize: 10000,
      // columns:[
      //   { name: 'Year', type: 'Integer'},
      //   { name: 'MonthofYear', type: 'Integer'},
      //   { name: 'Month', type: 'String'},
      //   { name: 'State', type: 'String'},
      //   { name: 'County', type: 'String'},
      //   { name: 'Flips', type: 'String'},
      //   { name: 'Rate', type: 'Numeric'},
      // ]
    }
    // {
    //   name: 'county_fips',
    //   type: 'csv',
    //   sourceUrl: window.location.origin + '/assets/data/us/county_fips_master.csv',
    //   delimiter: ','
    // }
  ],
  schema: {
    name: 'Unemployment',
    cubes: [
      {
        name: 'Unemployment Rate',
        defaultMeasure: 'Rate',
        visible: true,
        tables: [
          {
            name: 'unemployment'
          }
        ],
        dimensions: [
          {
            name: 'Calendar',
            caption: '日历',
            hierarchies: [
              {
                name: '',
                caption: '日历',
                levels: [
                  {
                    name: 'Year',
                    caption: '年',
                    column: 'Year',
                    type: 'Numeric'
                  },
                  {
                    name: 'Month',
                    caption: '月',
                    column: 'Month',
                    ordinalColumn: 'MonthofYear'
                  }
                ]
              }
            ]
          },
          {
            name: 'Region',
            caption: '地区',
            hierarchies: [
              {
                name: '',
                caption: '地区',
                primaryKey: 'Flips',
                levels: [
                  {
                    name: 'State',
                    caption: '州',
                    column: 'State'
                  },
                  {
                    name: 'County',
                    caption: '县',
                    column: 'County'
                  }
                ]
              }
            ]
          }
        ],
        measures: [
          {
            name: 'Rate',
            column: 'Rate',
            caption: '失业率',
            aggregator: 'avg'
          }
        ]
      }
    ]
  }
}

export const DUCKDB_UNEMPLOYMENT_CARDS = [
  {
    title: 'Unemployment by County',
    dataSettings: {
      dataSource: 'UnemploymentModel',
      entitySet: 'Unemployment Rate',
      chartAnnotation: {
        chartType: {
          type: 'GeoMap',
          map: 'USCounty',
          mapUrl: 'https://unpkg.com/us-atlas@3/counties-10m.json',
          projection: 'AlbersUsa',
          isTopoJSON: true,
          features: 'counties',
          mesh: 'states'
        },
        dimensions: [
          {
            dimension: '[Region]',
            level: '[Region].[County]'
          }
        ],
        measures: [
          {
            dimension: 'Measures',
            measure: 'Rate',
            palette: {
              name: 'Inferno',
            },
            domain: [0, 10],
            formatting: {
              digitsInfo: '0.2-2'
            }
          }
        ]
      },
      selectionVariant: {
        selectOptions: [
          {
            dimension: {
              dimension: '[Calendar]'
            },
            members: [
              {
                value: '[2016].[February]'
              }
            ]
          }
        ]
      }
    },
    chartSettings: {
    },
    chartOptions: {
      title: {
        text: 'Unemployment Rate of US (February 2016)',
        subtext: 'Data from kaggle',
        sublink:
          'https://www.kaggle.com/datasets/jayrav13/unemployment-by-county-us'
      },
      animationDurationUpdate: 500,
      animationEasingUpdate: 'cubicOut',
      geo: {
        itemStyle: {
          borderWidth: 0,
        },
      },
      seriesStyle: {
        // TODO 为了平均相同的 feature name
        mapValueCalculation: 'average',
        itemStyle: {
          borderColor: 'red',
          borderWidth: 1,
          opacity: 0.2
        },
      },
      visualMaps: [
        {
          show: true,
          type: 'piecewise',
          splitNumber: 10,
          calculable: true,
          left: 0,
          bottom: 0,
          orient: 'horizontal',
        }
      ]
    }
  },
]
