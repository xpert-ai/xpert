import { moduleMetadata, Meta, componentWrapperDecorator } from '@storybook/angular';
import { DisplayBehaviour } from '@xpert-ai/ocap-core'
import { NgmDisplayBehaviourComponent } from './display-behaviour.component';

export default {
  title: 'Common/DisplayBehaviour',
  component: NgmDisplayBehaviourComponent,
  decorators: [
    moduleMetadata({
      imports: [
        NgmDisplayBehaviourComponent
      ],
    }),
    //👇 Wraps our stories with a decorator
    componentWrapperDecorator(story => `<div style="width: 400px; margin: 3em">${story}</div>`),
  ],
} as Meta<NgmDisplayBehaviourComponent>;

export const Primary = {
  args: { 
    option: {
      value: 1,
      label: 'A'
    }
  }
};

export const DescriptionAndId = {
  args: { 
    option: {
      value: 1,
      label: 'A'
    },
    displayBehaviour: DisplayBehaviour.descriptionAndId
  }
};
