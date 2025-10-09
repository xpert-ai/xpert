import { z } from 'zod';
import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { IntegrationDifyPlugin } from './lib/integration-dify.plugin';

const ConfigSchema = z.object({
});

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: '@xpert-ai/plugin-integration-dify',
    version: '1.0.0',
    category: 'integration',
    icon: {
      type: 'image',
      value: `/assets/images/integrations/dify.svg`
    },
    displayName: 'Dify Integration',
    description: 'Provide Dify integration strategy',
    keywords: ['integration', 'dify'],
    author: 'XpertAI Team',
    homepage: 'https://xpertai.cloud',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register dify plugin');
    return { module: IntegrationDifyPlugin, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('dify plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('dify plugin stopped');
  },
};

export default plugin;