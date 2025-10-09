import { z } from 'zod';
import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { IntegrationFastGPTPlugin } from './lib/integration-fastgpt.plugin';

const ConfigSchema = z.object({
});

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: '@xpert-ai/plugin-integration-fastgpt',
    version: '1.0.0',
    category: 'integration',
    icon: {
      type: 'image',
      value: `/assets/images/integrations/fastgpt.svg`
    },
    displayName: 'FastGPT Integration',
    description: 'Provide FastGPT integration strategy',
    keywords: ['integration', 'fastgpt'],
    author: 'XpertAI Team',
    homepage: 'https://xpertai.cloud',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register fastgpt plugin');
    return { module: IntegrationFastGPTPlugin, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('fastgpt plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('fastgpt plugin stopped');
  },
};

export default plugin;