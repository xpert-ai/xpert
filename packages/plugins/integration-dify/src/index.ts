import { z } from 'zod';
import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { IntegrationDifyPlugin } from './lib/integration-dify.plugin';

const ConfigSchema = z.object({
});

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: '@xpert-ai/plugin-integration-dify',
    version: '1.0.0',
    displayName: 'Dify Integration',
    description: 'Provide Dify integration strategy',
    keywords: ['integration', 'dify'],
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