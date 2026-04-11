import { FormGroup, ReactiveFormsModule } from '@angular/forms';

import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { NgmFormlyModule } from '@xpert-ai/formly';
import { FormlyModule } from '@ngx-formly/core';
import { Meta, moduleMetadata, Story } from '@storybook/angular';
import { MetadFormlyEmptyModule } from '../empty';
import { MetadFormlyPanelModule } from '../panel';
import { MetadFormlyAccordionComponent } from './accordion-wrapper.component';
import { MetadFormlyAccordionModule } from './accordion-wrapper.module';
import { ZardButtonComponent } from '@xpert-ai/headless-ui'

export default {
  title: 'Material/Accordion',
  component: MetadFormlyAccordionComponent,
  decorators: [
    moduleMetadata({
      imports: [
        BrowserAnimationsModule,
        ReactiveFormsModule,
        ZardButtonComponent,
        FormlyModule.forRoot(),
        NgmFormlyModule,
        MetadFormlyAccordionModule,
        MetadFormlyPanelModule,
        MetadFormlyEmptyModule,
      ],
    }),
  ],
} as Meta<MetadFormlyAccordionComponent>;

const Template: Story<any> = (args: MetadFormlyAccordionComponent) => ({
  props: args,
  template: `<formly-form [form]="form" [fields]="schema" [model]="model"></formly-form>
<button z-button zType="ghost" [disabled]="form.invalid">Submit</button>
<div>Result:</div>
<pre>{{form.value | json}}</pre>`,
});

function fieldGroup() {
  return [
    {
      className: 'ngm-formly__col col-6',
      key: 'show',
      type: 'checkbox',
      templateOptions: {
        label: 'Is Show',
      },
    },
    {
      className: 'ngm-formly__col col-6',
      key: 'type',
      type: 'select',
      templateOptions: {
        label: 'Type',
        options: [
          { value: 'value', label: 'Value' },
          { value: 'category', label: 'Category' },
        ],
      },
    },
  ];
}

const AccordionFieldGroup = [
  {
    key: 'value',
    hideExpression: `!field.parent.model.showValue`,
    templateOptions: {
      label: 'Expansion Value',
      keyShow: 'showValue',
      toggleable: true,
    },
    fieldGroup: fieldGroup(),
  },
  {
    key: 'value2',
    hideExpression: `!field.parent.model.showValue2`,
    templateOptions: {
      label: 'Expansion Value2',
      keyShow: 'showValue2',
      toggleable: true,
    },
    fieldGroup: fieldGroup(),
  },
  {
    key: 'value3',
    hideExpression: `!field.parent.model.showValue3`,
    templateOptions: {
      label: 'Expansion Value3',
      keyShow: 'showValue3',
      toggleable: true,
      disabled: true,
    },
    fieldGroup: fieldGroup(),
  },
  {
    key: 'value4',
    hideExpression: `!field.parent.model.showValue4`,
    fieldGroup: fieldGroup(),
  },
  {
    key: 'value5',
    fieldGroup: fieldGroup(),
  },
];

const ShowValues = [
  {
    key: 'showValue',
    type: 'empty',
  },
  {
    key: 'showValue2',
    type: 'empty',
  },
  {
    key: 'showValue3',
    type: 'empty',
  },
];

const ShowValueTrues = [
  {
    key: 'showValue',
    type: 'empty',
    defaultValue: true,
  },
  {
    key: 'showValue2',
    type: 'empty',
    defaultValue: true,
  },
  {
    key: 'showValue3',
    type: 'empty',
    defaultValue: true,
  },
];

export const Primary = Template.bind({});
Primary.args = {
  form: new FormGroup({}),
  model: {},
  schema: [
    ...ShowValues,
    {
      wrappers: ['accordion'],
      templateOptions: {
        label: 'Expansion Type',
      },
      fieldGroup: AccordionFieldGroup,
    },
  ],
};

export const DisplayMode = Template.bind({});
DisplayMode.args = {
  form: new FormGroup({}),
  model: {},
  schema: [
    ...ShowValues,
    {
      wrappers: ['accordion'],
      templateOptions: {
        displayMode: 'default',
      },
      fieldGroup: AccordionFieldGroup,
    },
  ],
};

export const HideToggle = Template.bind({});
HideToggle.args = {
  form: new FormGroup({}),
  model: {},
  schema: [
    ...ShowValues,
    {
      wrappers: ['accordion'],
      templateOptions: {
        hideToggle: true,
      },
      fieldGroup: AccordionFieldGroup,
    },
  ],
};

export const ExpandedMulti = Template.bind({});
ExpandedMulti.args = {
  form: new FormGroup({}),
  model: {},
  schema: [
    ...ShowValueTrues,
    {
      wrappers: ['accordion'],
      templateOptions: {
        expandedMulti: true,
      },
      fieldGroup: AccordionFieldGroup,
    },
  ],
};

export const TogglePosition = Template.bind({});
TogglePosition.args = {
  form: new FormGroup({}),
  model: {},
  schema: [
    ...ShowValueTrues,
    {
      wrappers: ['accordion'],
      templateOptions: {
        togglePosition: 'after',
      },
      fieldGroup: AccordionFieldGroup,
    },
  ],
};

export const ElevationZ = Template.bind({});
ElevationZ.args = {
  form: new FormGroup({}),
  model: {},
  schema: [
    ...ShowValues,
    {
      wrappers: ['accordion'],
      templateOptions: {
        elevationZ: true,
      },
      fieldGroup: AccordionFieldGroup,
    },
  ],
};

export const SubAccordion = Template.bind({});
SubAccordion.args = {
  form: new FormGroup({}),
  model: {},
  schema: [
    {
      key: 'showValue',
      type: 'empty',
    },
    {
      wrappers: ['accordion'],
      fieldGroup: [
        {
          key: 'value',
          templateOptions: {
            label: 'Sub Accordion Value',
          },
          fieldGroup: [
            ...ShowValues,
            {
              wrappers: ['accordion'],
              templateOptions: {
                elevationZ: true,
              },
              fieldGroup: AccordionFieldGroup,
            },
          ],
        },
      ],
    },
  ],
};

export const SubAccordionWithHide = Template.bind({});
SubAccordionWithHide.args = {
  form: new FormGroup({}),
  model: {},
  schema: [
    {
      key: 'showValue',
      type: 'empty',
    },
    {
      wrappers: ['accordion'],
      fieldGroup: [
        {
          key: 'value',
          hideExpression: `!field.parent.model.showValue`,
          templateOptions: {
            label: 'Sub Accordion Value',
            keyShow: 'showValue',
          },
          fieldGroup: [
            ...ShowValues,
            {
              wrappers: ['accordion'],
              templateOptions: {
                elevationZ: true,
              },
              fieldGroup: AccordionFieldGroup,
            },
          ],
        },
      ],
    },
  ],
};

export const SubAccordionWithFlatFields = Template.bind({});
SubAccordionWithFlatFields.args = {
  form: new FormGroup({}),
  model: {},
  schema: [
    {
      key: 'showValue',
      type: 'empty',
      defaultValue: true
    },
    {
      wrappers: ['accordion'],
      fieldGroup: [
        {
          key: 'value',
          hideExpression: `!field.parent.model.showValue`,
          templateOptions: {
            label: 'Sub Accordion Value',
            keyShow: 'showValue',
          },
          fieldGroup: [
            {
              key: 'flatField',
              type: 'input',
              templateOptions: {
                label: 'Flat Field'
              }
            },
            ...ShowValues,
            {
              wrappers: ['accordion'],
              templateOptions: {
                elevationZ: true,
              },
              fieldGroup: AccordionFieldGroup,
            },
          ],
        },
      ],
    },
  ],
};
