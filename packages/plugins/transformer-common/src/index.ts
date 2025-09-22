import { z } from 'zod';
import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { DefaultTransformerPlugin } from './lib/transformer-common.plugin';

const ConfigSchema = z.object({
});

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: '@xpert-ai/plugin-transformer-common',
    version: '1.0.0',
    displayName: 'Common Transformer',
    description: 'Provide common transformation functionality',
    keywords: ['pdf', 'markdown', 'json', 'transformer'],
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register common transformer plugin');
    return { module: DefaultTransformerPlugin, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('common transformer plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('common transformer plugin stopped');
  },
};

export default plugin;