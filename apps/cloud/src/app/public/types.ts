import {
  ChartDataZoomType,
  ChartDimensionRoleType,
  ChartMeasureRoleType,
  ChartOptions,
  OrderDirection,
  ReferenceLineAggregation,
  ReferenceLineType,
  ReferenceLineValueType
} from '@xpert-ai/ocap-core'

export const MAP_CARDS = [
  {
    title: 'Country GDP',
    dataSettings: {
      dataSource: 'WASM',
      entitySet: 'CountryGDP',
      chartAnnotation: {
        chartType: {
          type: 'Map',
          map: 'World',
          mapUrl: `https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json`,
          projection: 'NaturalEarth1'
        },
        dimensions: [
          {
            dimension: 'Country'
          },
        ],
        measures: [
          {
            dimension: 'Measures',
            measure: 'GDP Per Capita',
            formatting: {
              shortNumber: true
            }
          }
        ]
      },
    },
    chartSettings: {},
    chartOptions: {}
  },
  {
    title: 'Csse Covid-19 Daily',
    dataSettings: {
      dataSource: 'WASM',
      entitySet: 'CsseCovid19Daily',
      chartAnnotation: {
        chartType: {
          type: 'Map',
          map: 'World',
          mapUrl: `https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json`,
          projection: 'NaturalEarth1'
        },
        dimensions: [
          {
            dimension: 'Country_Region'
          },
          {
            dimension: 'Lat',
            role: ChartDimensionRoleType.Lat
          },
          {
            dimension: 'Long_',
            role: ChartDimensionRoleType.Long
          }
        ],
        measures: [
          {
            dimension: 'Measures',
            measure: 'Confirmed',
            shapeType: 'scatter',
            formatting: {
              shortNumber: true
            }
          }
        ]
      },
      selectionVariant: {
        selectOptions: [
          {
            dimension: {
              dimension: 'Country_Region'
            },
            exclude: true,
            members: [
              {
                value: 'US'
              }
            ]
          }
        ]
      }
    },
    chartSettings: {},
    chartOptions: {}
  },
  {
    title: 'Csse Covid-19 Daily',
    dataSettings: {
      dataSource: 'WASM',
      entitySet: 'CsseCovid19Daily',
      chartAnnotation: {
        chartType: {
          type: 'Map',
          map: 'World',
          mapUrl: `https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json`,
          projection: 'NaturalEarth1'
        },
        dimensions: [
          {
            dimension: 'Country_Region'
          }
        ],
        measures: [
          {
            dimension: 'Measures',
            measure: 'Incident_Rate',
            formatting: {
              shortNumber: true
            }
          }
        ]
      },
      selectionVariant: {
        selectOptions: [
          {
            dimension: {
              dimension: 'Country_Region'
            },
            exclude: true,
            members: [
              {
                value: 'US'
              }
            ]
          }
        ]
      }
    }
  },
  {
    title: 'Csse Covid-19 Daily',
    dataSettings: {
      dataSource: 'WASM',
      entitySet: 'CsseCovid19Daily',
      chartAnnotation: {
        chartType: {
          type: 'Map',
          map: 'USA',
          mapUrl: `https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json`,
          projection: 'AlbersUsa'
        },
        dimensions: [
          {
            dimension: 'Province_State'
          }
        ],
        measures: [
          {
            dimension: 'Measures',
            measure: 'Incident_Rate',
            formatting: {
              shortNumber: true
            }
          }
        ]
      },
      selectionVariant: {
        selectOptions: [
          {
            dimension: {
              dimension: 'Country_Region'
            },
            members: [
              {
                value: 'US'
              }
            ]
          }
        ]
      }
    }
  },
  {
    title: 'Csse Covid-19 Daily',
    dataSettings: {
      dataSource: 'WASM',
      entitySet: 'CsseCovid19Daily',
      chartAnnotation: {
        chartType: {
          type: 'Map',
          map: 'USA',
          mapUrl: `https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json`
        },
        dimensions: [
          {
            dimension: 'Province_State'
          }
        ],
        measures: [
          {
            dimension: 'Measures',
            measure: 'Confirmed',
            formatting: {
              shortNumber: true
            }
          }
          // {
          //   dimension: 'Measures',
          //   measure: 'Deaths'
          // },
          // {
          //   dimension: 'Measures',
          //   measure: 'Case_Fatality_Ratio',
          //   role: ChartMeasureRoleType.Axis2,
          //   formatting: {
          //     unit: '%'
          //   }
          // }
        ]
      },
      selectionVariant: {
        selectOptions: [
          {
            dimension: {
              dimension: 'Country_Region'
            },
            members: [
              {
                value: 'US'
              }
            ]
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
      dataZoom: {
        type: ChartDataZoomType.INSIDE
      }
    } as ChartOptions
  }
]

export const CARTESIAN_CARDS = [
  {
    title: 'Csse Covid-19 Daily',
    dataSettings: {
      dataSource: 'WASM',
      entitySet: 'CsseCovid19Daily',
      chartAnnotation: {
        chartType: {
          type: 'Bar'
        },
        dimensions: [
          {
            dimension: 'Country_Region'
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
            measure: 'Case_Fatality_Ratio',
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
      dataZoom: {
        type: ChartDataZoomType.INSIDE
      }
    } as ChartOptions
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
    }
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
                label: 'Sales Average',
                type: ReferenceLineType.markLine,
                valueType: ReferenceLineValueType.dynamic,
                aggregation: ReferenceLineAggregation.average
              }
            ]
          }
        ]
      }
    }
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
            measure: 'quantity',
            role: ChartMeasureRoleType.Size
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
