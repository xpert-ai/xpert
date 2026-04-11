import { HttpClientModule } from '@angular/common/http'
import { FormControl } from '@angular/forms'
import { BrowserAnimationsModule } from '@angular/platform-browser/animations'
import { PropertySelectType } from '@xpert-ai/components/property'
import { NxCoreModule } from '@xpert-ai/core'
import { C_MEASURES, NxDSCoreModule, Sales } from '@xpert-ai/ds-core'
import { NxDSMockModule } from '@xpert-ai/ds-mock'
import { Meta, moduleMetadata, Story } from '@storybook/angular'
import { LoggerModule, NgxLoggerLevel } from 'ngx-logger'
import { PACFormlyPropertySelectComponent } from '../property-select/property-select.component'
import { NxFormlyPropertySelectModule } from '../property-select/property-select.module'
import { NxFormlyFormModule } from './formly-form.component'

export default {
  title: 'Components/Formly/Property Select',
  component: PACFormlyPropertySelectComponent,
  argTypes: {
    selectedChange: { action: 'clicked' },
  },
  decorators: [
    moduleMetadata({
      declarations: [],
      imports: [
        BrowserAnimationsModule,
        HttpClientModule,
        LoggerModule.forRoot({
          level: NgxLoggerLevel.DEBUG,
        }),
        NxFormlyFormModule,
        NxFormlyPropertySelectModule,
        NxCoreModule.forRoot(),
        NxDSCoreModule.forRoot(),
        NxDSMockModule.forRoot({
          '': {
            type: 'Mock',
            uri: '',
            settings: {
              entityTypes: {
                MyEntity: {
                  entityType: Sales.SALES_ENTITY_TYPE,
                },
              },
            },
          },
        }),
      ],
    }),
  ],
} as Meta

const Template: Story<PACFormlyPropertySelectComponent> = (
  args: PACFormlyPropertySelectComponent
) => ({
  component: PACFormlyPropertySelectComponent,
  props: args,
})

const formControl = new FormControl({
  dimension: '[Customers]',
  hierarchy: '[Customers     H1]',
  level: '[Customers     H1].[State Province]',
  displayBehaviour: null,
})

export const Primary = Template.bind(
  {},
  {
    field: {
      templateOptions: {
        dataSettings: {
          entitySet: 'MyEntity',
        },
        entityType: Sales.SALES_ENTITY_TYPE,
        propertySelectType: PropertySelectType.All,
        showMeasures: true,
      },
      formControl: formControl,
      model: {},
    },
  }
)

const measureControl = new FormControl({
  dimension: C_MEASURES,
  measure: 'ZAMOUNT',
})

export const Measures = Template.bind(
  {},
  {
    field: {
      templateOptions: {
        dataSettings: {
          entitySet: 'MyEntity',
        },
        entityType: Sales.SALES_ENTITY_TYPE,
        propertySelectType: PropertySelectType.Measure,
      },
      formControl: measureControl,
      model: {},
    },
  }
)

export const Members = Template.bind(
  {},
  {
    field: {
      templateOptions: {
        dataSettings: {
          entitySet: 'MyEntity',
        },
        entityType: Sales.SALES_ENTITY_TYPE,
        showMeasures: true,
      },
      formControl: formControl,
      model: {},
    },
  }
)
