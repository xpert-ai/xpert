import { HttpClientModule } from '@angular/common/http'
import { BrowserAnimationsModule } from '@angular/platform-browser/animations'
import { TranslateModule } from '@ngx-translate/core'
import type { Meta, StoryObj } from '@storybook/angular'
import { applicationConfig, argsToTemplate, componentWrapperDecorator, moduleMetadata } from '@storybook/angular'
import { provideHttpClient } from '@angular/common/http'
import { provideAnimations } from '@angular/platform-browser/animations'
import { provideOcapMock, provideTranslate } from '@xpert-ai/ocap-angular/mock'
import { action } from '@storybook/addon-actions'
import {
  AggregationRole,
  C_MEASURES,
  CalculatedProperty,
  CalculationType,
  Dimension,
  EntityType,
  Measure
} from '@xpert-ai/ocap-core'
import { LoggerModule, NgxLoggerLevel } from 'ngx-logger'
import { MonacoEditorModule } from 'ngx-monaco-editor'
import { NgmPropertySelectComponent } from '../property-select/property-select.component'
import { FormsModule } from '@angular/forms'
import { PropertyCapacity } from '../types'

const ENTITY_TYPE: EntityType = {
  name: 'Sales',
  visible: true,
  properties: {
    A: {
      name: 'A',
      caption: 'Field A',
      role: AggregationRole.dimension,
      hierarchies: [
        {
          name: '[A]',
          caption: 'H-A',
          role: AggregationRole.hierarchy,
          levels: [
            {
              name: '[A].[All]',
              caption: '[A] Level 00',
              role: AggregationRole.level,
              levelNumber: 0
            },
            {
              name: '[A].[Description]',
              caption: '[A] Level 01',
              role: AggregationRole.level,
              levelNumber: 1,
              properties: [
                {
                  name: '[TEXTSH]',
                  caption: '短文本'
                },
                {
                  name: '[TEXTMD]',
                  caption: '中文本'
                },
                {
                  name: '[TEXTLG]',
                  caption: '长文本'
                }
              ]
            }
          ]
        }
      ]
    },
    B: {
      name: 'B',
      caption: 'Field B',
      role: AggregationRole.dimension
    },
    C: {
      name: 'C',
      caption: 'Field C',
      role: AggregationRole.measure
    },
    D: {
      name: 'D',
      caption: 'Field D',
      role: AggregationRole.measure,
      calculationType: CalculationType.Calculated,
      formula: 'C / 100'
    } as CalculatedProperty
  }
}

const meta: Meta<NgmPropertySelectComponent> = {
  title: 'Entity/PropertySelect',
  component: NgmPropertySelectComponent,
  excludeStories: /.*Data$/,
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [provideAnimations(), provideHttpClient(), provideOcapMock(), provideTranslate()]
    }),
    moduleMetadata({
      //👇 Imports both components to allow component composition with Storybook
      declarations: [],
      imports: [
        FormsModule,
        NgmPropertySelectComponent
      ]
    }),
    //👇 Wraps our stories with a decorator
    componentWrapperDecorator((story) => `<div style="margin: 3em">${story}</div>`)
  ],
  render: (args) => ({
    props: {
      ...args,
    },
    template: `<ngm-property-select [(ngModel)]="inputValue" ${argsToTemplate(args)}></ngm-property-select>`
  })
}

export default meta

type Story = StoryObj<NgmPropertySelectComponent & { inputValue: Dimension | Measure }>

export const Primary: Story = {
  args: {
    label: 'Property Select',
    dataSettings: {
      dataSource: 'key_sales',
      entitySet: 'SalesOrder'
    },
    entityType: ENTITY_TYPE,
    capacities: [
      PropertyCapacity.Dimension,
      PropertyCapacity.Measure,
      PropertyCapacity.Parameter
    ],
    inputValue: {
      dimension: 'A',
      hierarchy: '[A]',
    }
  }
}

export const DimensionWithHierarchy: Story = {
  args: {
    label: 'Property Select',
    dataSettings: {
      dataSource: 'key_sales',
      entitySet: 'SalesOrder'
    },
    entityType: ENTITY_TYPE,
    capacities: [
      PropertyCapacity.Dimension,
      PropertyCapacity.Measure,
      PropertyCapacity.Parameter
    ],
    inputValue: {
      dimension: '[Customers]',
      hierarchy: '[Customers]',
      level: '[Customers].[Country]'
    }
  }
}

// export const DimensionWithoutHierarchy = Template.bind({})
// DimensionWithoutHierarchy.args = {
//   entityType: ENTITY_TYPE,
//   value: {
//     dimension: 'B'
//   }
// }

// export const Level = {
//   args: {
//     entityType: ENTITY_TYPE,
//     value: {
//       dimension: 'A',
//       hierarchy: '[A]',
//       level: '[A].[Description]'
//     }
//   }
// }

// export const MeasureField = {
//   args: {
//     entityType: ENTITY_TYPE,
//     value: {
//       dimension: 'C'
//     }
//   }
// }

// const measureObject: Measure = {
//   dimension: C_MEASURES,
//   measure: 'C'
// }

// export const MeasureObject = Template.bind({})
// MeasureObject.args = {
//   entityType: ENTITY_TYPE,
//   value: measureObject
// }

// const measuresDimension: Dimension = {
//   dimension: C_MEASURES,
//   members: ['C']
// }

// export const MeasuresObject = Template.bind({})
// MeasuresObject.args = {
//   entityType: ENTITY_TYPE,
//   value: measuresDimension
// }

// export const Calculation = Template.bind({})
// Calculation.args = {
//   entityType: ENTITY_TYPE,
//   value: {
//     dimension: 'D'
//   }
// }

// export const Members = Template.bind({})
// Members.args = {
//   entityType: ENTITY_TYPE,
//   value: {
//     dimension: 'A',
//     members: [
//       {
//         value: 'A1'
//       },
//       {
//         value: 'A2'
//       }
//     ]
//   }
// }

// export const Properties = Template.bind({})
// Properties.args = {
//   entityType: ENTITY_TYPE,
//   value: {
//     dimension: 'A',
//     hierarchy: '[A]',
//     level: '[A].[Description]',
//     properties: ['[TEXTSH]', '[TEXTLG]']
//   }
// }
