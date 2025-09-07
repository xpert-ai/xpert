import { z } from 'zod';
import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { IntegrationGithubPlugin } from './lib/integration-github.plugin'

const ConfigSchema = z.object({
});

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: '@xpert-ai/plugin-integration-github',
    version: '1.0.0',
    displayName: 'GitHub Integration',
    description: 'Provide GitHub integration strategy',
    keywords: ['integration', 'github'],
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register github plugin');
    return { module: IntegrationGithubPlugin, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('github plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('github plugin stopped');
  },
};

export default plugin;