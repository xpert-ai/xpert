import { HttpClientModule } from '@angular/common/http'
import { BrowserAnimationsModule } from '@angular/platform-browser/animations'
import { FormlyModule } from '@ngx-formly/core'
import { C_FORMLY_INITIAL_VALUE } from '@xpert-ai/core'
import { NxDSCoreModule, Sales } from '@xpert-ai/ds-core'
import { NxDSMockModule } from '@xpert-ai/ds-mock'
import { Meta, moduleMetadata, Story } from '@storybook/angular'
import { LoggerModule, NgxLoggerLevel } from 'ngx-logger'
import { NxFormlyExpansionWrapperModule, NxFormlyExpansionWrapperComponent } from '../expansion-wrapper'
import { NxFormlyFormModule, NxFormlyFormPannelComponent } from './formly-form.component'

export default {
  title: 'Components/Formly/Expansion Wrapper',
  component: NxFormlyExpansionWrapperComponent,
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
        FormlyModule.forRoot(),
        NxFormlyExpansionWrapperModule,
        NxDSCoreModule.forRoot(),
        NxDSMockModule.forRoot({
          '': {
            id: '',
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

const Template: Story<NxFormlyFormPannelComponent> = (args: NxFormlyFormPannelComponent) => ({
  component: NxFormlyFormPannelComponent,
  props: args,
})

const SCHEMA = [
  {
    key: 'annotation',
    wrappers: ['expansion'],
    templateOptions: {
      label: '可折叠可选择组件',
      enableSelectFields: true,
    },
    fieldGroup: [
      {
        key: 'title',
        type: 'input',
        templateOptions: {
          label: '标题',
          icon: 'title',
        },
      },
      {
        key: 'type',
        type: 'select',
        templateOptions: {
          label: '类型',
          icon: 'functions',
          options: [
            {
              value: 1,
              label: 'Option A',
            },
            {
              value: 2,
              label: 'Option B',
            },
            {
              value: 3,
              label: 'Option C',
            },
          ],
        },
      },
      {
        key: 'chartAnnotation',
        wrappers: ['panel'],
        // 初始化为 null
        defaultValue: C_FORMLY_INITIAL_VALUE,
        templateOptions: {
          label: '图形',
          icon: 'add_chart',
        },
        fieldGroup: [
          {
            key: 'chartType',
            type: 'select',
            templateOptions: {
              label: '图形类型',
              options: [
                {
                  value: 1,
                  label: 'Option A',
                },
                {
                  value: 2,
                  label: 'Option B',
                },
                {
                  value: 3,
                  label: 'Option C',
                },
              ],
            },
          },
        ],
      },
    ],
  },
  {
    key: 'toggleable',
    wrappers: ['expansion'],
    templateOptions: {
      label: '可折叠关闭组件',
      toggleable: true,
    },
    fieldGroup: [
      {
        key: 'title',
        type: 'input',
        templateOptions: {
          label: '标题',
          icon: 'title',
        },
      },
      {
        key: 'type',
        type: 'select',
        templateOptions: {
          label: '类型',
          icon: 'functions',
          options: [
            {
              value: 1,
              label: 'Option A',
            },
            {
              value: 2,
              label: 'Option B',
            },
            {
              value: 3,
              label: 'Option C',
            },
          ],
        },
      },
      {
        key: 'chartAnnotation',
        wrappers: ['panel'],
        // 初始化为 null
        defaultValue: C_FORMLY_INITIAL_VALUE,
        templateOptions: {
          label: '图形',
          icon: 'add_chart',
        },
        fieldGroup: [
          {
            key: 'chartType',
            type: 'select',
            templateOptions: {
              label: '图形类型',
              options: [
                {
                  value: 1,
                  label: 'Option A',
                },
                {
                  value: 2,
                  label: 'Option B',
                },
                {
                  value: 3,
                  label: 'Option C',
                },
              ],
            },
          },
        ],
      },
    ],
  },
  {
    key: 'toggleable-selectable',
    wrappers: ['expansion'],
    templateOptions: {
      label: '可折叠可关闭可选择组件',
      toggleable: true,
      enableSelectFields: true,
    },
    fieldGroup: [
      {
        key: 'title',
        type: 'input',
        templateOptions: {
          label: '标题',
          icon: 'title',
        },
      },
      {
        key: 'type',
        type: 'select',
        templateOptions: {
          label: '类型',
          icon: 'functions',
          options: [
            {
              value: 1,
              label: 'Option A',
            },
            {
              value: 2,
              label: 'Option B',
            },
            {
              value: 3,
              label: 'Option C',
            },
          ],
        },
      },
      {
        key: 'chartAnnotation',
        wrappers: ['panel'],
        // 初始化为 null
        defaultValue: C_FORMLY_INITIAL_VALUE,
        templateOptions: {
          label: '图形',
          icon: 'add_chart',
        },
        fieldGroup: [
          {
            key: 'chartType',
            type: 'select',
            templateOptions: {
              label: '图形类型',
              options: [
                {
                  value: 1,
                  label: 'Option A',
                },
                {
                  value: 2,
                  label: 'Option B',
                },
                {
                  value: 3,
                  label: 'Option C',
                },
              ],
            },
          },
          {
            key: 'dimensions',
            type: 'array',
            templateOptions: {
              label: 'Dimensions',
              addText: 'Add Dimension',
            },
            fieldArray: {
              fieldGroup: [
                {
                  type: 'select',
                  key: 'dimension',
                  templateOptions: {
                    label: 'Dimension Path',
                    placeholder: 'Select Dimension',
                    options: [
                      {value: 1, label: 'A1'},
                      {value: 2, label: 'A2'}
                    ]
                  },
                  
                }
              ]
            },
          },
        ],
      },
      {
        key: 'selectionPresentationVariant',
        defaultValue: C_FORMLY_INITIAL_VALUE,
        type: 'array',
        templateOptions: {
          label: 'Selection Presentation Variant',
          matIcon: 'perm_data_setting',
          addText: 'Add SelectionPresentationVariant',
        },
        fieldArray: {
          fieldGroup: [
            {
              key: 'id',
              type: 'input',
              templateOptions: {
                label: 'id',
                placeholder: 'input id',
                required: true,
              },
            },
          ]
        }
      }
    ],
  },
]

export const Primary = (args: NxFormlyFormPannelComponent) => ({
  component: NxFormlyFormPannelComponent,
  props: {
    fields: SCHEMA,
    model: {

    },
  },
})
