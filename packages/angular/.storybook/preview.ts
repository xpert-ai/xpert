import { setCompodocJson } from '@storybook/addon-docs/angular';
import { Preview } from '@storybook/angular';
import { withThemeByClassName } from '@storybook/addon-themes';
import docJson from './documentation.json';

setCompodocJson(docJson);

const preview: Preview = {
  parameters: {
    docs: {
      toc: true, // 👈 Enables the table of contents
    },
  },
  decorators: [
    withThemeByClassName({
      themes: {
        light: '',
        dark: 'dark',
      },
      defaultTheme: 'light',
    }),
  ]
};

export default preview;