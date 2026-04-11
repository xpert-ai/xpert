import { CommonModule } from '@angular/common'
import { importProvidersFrom } from '@angular/core'
import { provideAnimations } from '@angular/platform-browser/animations'
import {
  DisplayDensity,
  NgmDSCoreService,
  NgmMissingTranslationHandler,
  OCAP_AGENT_TOKEN,
  OCAP_DATASOURCE_TOKEN,
  OCAP_MODEL_TOKEN,
  OcapCoreModule
} from '@xpert-ai/ocap-angular/core'
import { AgentType, C_MEASURES, DataSource, Schema, Type } from '@xpert-ai/ocap-core'
import { MissingTranslationHandler, TranslateLoader, TranslateModule } from '@ngx-translate/core'
import { Meta, applicationConfig, moduleMetadata } from '@storybook/angular'
import { NgxEchartsModule } from 'ngx-echarts'
import { Observable, of } from 'rxjs'
import { ZhHans } from '../i18n'
import { CUBE_SALES_ORDER, MockAgent } from '../mock/agent-mock.service'
import { AnalyticalCardComponent } from './analytical-card.component'
import { AnalyticalCardModule } from './analytical-card.module'

class CustomLoader implements TranslateLoader {
  getTranslation(lang: string): Observable<any> {
    return of(ZhHans)
  }
}

export default {
  title: 'Story/AnalyticalCard',
  component: AnalyticalCardComponent,
  decorators: [
    applicationConfig({
      providers: [
        provideAnimations(),
        importProvidersFrom(
          TranslateModule.forRoot({
            missingTranslationHandler: {
              provide: MissingTranslationHandler,
              useClass: NgmMissingTranslationHandler
            },
            loader: { provide: TranslateLoader, useClass: CustomLoader },
            defaultLanguage: 'zh-Hans'
          })
        ),
        importProvidersFrom(OcapCoreModule),
        importProvidersFrom(
          NgxEchartsModule.forRoot({
            echarts: () => import('echarts')
          })
        )
      ]
    }),
    moduleMetadata({
      imports: [CommonModule, AnalyticalCardModule],
      providers: [
        NgmDSCoreService,
        {
          provide: OCAP_AGENT_TOKEN,
          useClass: MockAgent,
          multi: true
        },
        {
          provide: OCAP_DATASOURCE_TOKEN,
          useValue: {
            type: 'SQL',
            factory: async (): Promise<Type<DataSource>> => {
              const { SQLDataSource } = await import('@xpert-ai/ocap-sql')
              return SQLDataSource
            }
          },
          multi: true
        },
        {
          provide: OCAP_MODEL_TOKEN,
          useValue: {
            name: 'Sales',
            type: 'SQL',
            agentType: AgentType.Browser,
            settings: {
              ignoreUnknownProperty: true
            },
            schema: {
              cubes: [
                CUBE_SALES_ORDER,
                {
                  ...CUBE_SALES_ORDER,
                  name: 'SalesOrder10s'
                },
                {
                  ...CUBE_SALES_ORDER,
                  name: 'Empty'
                }
              ]
            } as Schema
          },
          multi: true
        }
      ]
    })
  ]
} as Meta<AnalyticalCardComponent>

export const Primary = {
  args: {
    title: 'Primary Analytical Card',
    appearance: {
      // displayBehaviour: DisplayBehaviour.auto,
    },
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'SalesOrder',
      chartAnnotation: {
        chartType: {
          type: 'Bar'
        },
        dimensions: [
          {
            dimension: '[Product]'
          }
        ],
        measures: [
          {
            dimension: C_MEASURES,
            measure: 'Sales'
          }
        ]
      }
    },
    options: {}
  }
}

export const Appearance = {
  args: {
    title: 'Display Density Compact',
    appearance: {
      displayDensity: DisplayDensity.compact
    },
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'SalesOrder',
      chartAnnotation: {
        chartType: {
          type: 'Bar'
        },
        dimensions: [
          {
            dimension: '[Product]'
          }
        ],
        measures: [
          {
            dimension: C_MEASURES,
            measure: 'Sales'
          }
        ]
      }
    },
    options: {}
  }
}

export const Loading = {
  args: {
    title: 'Loading',
    appearance: {
      displayDensity: DisplayDensity.compact
    },
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'SalesOrder10s',
      chartAnnotation: {
        chartType: {
          type: 'Bar'
        },
        dimensions: [
          {
            dimension: '[Product]'
          }
        ],
        measures: [
          {
            dimension: C_MEASURES,
            measure: 'Sales'
          }
        ]
      }
    },
    options: {}
  }
}

export const HideButtons = {
  args: {
    title: 'Hide Buttons',
    appearance: {},
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'SalesOrder',
      chartAnnotation: {
        chartType: {
          type: 'Bar'
        },
        dimensions: [
          {
            dimension: '[Product]'
          }
        ],
        measures: [
          {
            dimension: C_MEASURES,
            measure: 'Sales'
          }
        ]
      }
    },
    options: {}
  }
}

export const Empty = {
  args: {
    title: 'Empty Data',
    appearance: {},
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'Empty',
      chartAnnotation: {
        chartType: {
          type: 'Bar'
        },
        dimensions: [
          {
            dimension: '[Product]'
          }
        ],
        measures: [
          {
            dimension: C_MEASURES,
            measure: 'Sales'
          }
        ]
      }
    },
    options: {}
  }
}

export const Error = {
  args: {
    title: 'Error',
    appearance: {},
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'SalesOrder',
      chartAnnotation: {
        chartType: {
          type: 'Bar'
        },
        dimensions: [
          {
            dimension: '[Product]'
          }
        ],
        measures: [
          {
            dimension: C_MEASURES,
            measure: 'Sales1'
          }
        ]
      }
    },
    options: {}
  }
}

export const SetOptionError = {
  args: {
    title: 'SetOption Error',
    appearance: {},
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'SalesOrder',
      chartAnnotation: {
        chartType: {
          type: 'Bar'
        },
        dimensions: [
          {
            dimension: '[Product]'
          }
        ],
        measures: [
          {
            dimension: C_MEASURES,
            measure: 'Sales'
          },
          {
            dimension: C_MEASURES,
            measure: 'Sales'
          }
        ]
      }
    },
    options: {}
  }
}

export const DrillDimensions = {
  args: {
    title: 'Drill Dimensions',
    appearance: {},
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'SalesOrder',
      chartAnnotation: {
        chartType: {
          type: 'Bar'
        },
        dimensions: [
          {
            dimension: '[Product]'
          }
        ],
        measures: [
          {
            dimension: C_MEASURES,
            measure: 'Sales'
          }
        ]
      },
      presentationVariant: {
        groupBy: [
          {
            dimension: '[Department]',
            level: '[Department].[Department]'
          }
        ]
      }
    },
    options: {}
  }
}

export const ChartTypes = {
  args: {
    title: 'Chart Types',
    appearance: {},
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'SalesOrder',
      chartAnnotation: {
        chartType: {
          type: 'Bar'
        },
        dimensions: [
          {
            dimension: '[Product]'
          }
        ],
        measures: [
          {
            dimension: C_MEASURES,
            measure: 'Sales'
          }
        ]
      },
      presentationVariant: {
        groupBy: [
          {
            dimension: '[Department]',
            level: '[Department].[Department]'
          }
        ]
      }
    },
    chartSettings: {
      chartTypes: [
        {
          type: 'Line'
        }
      ]
    },
    options: {}
  }
}
