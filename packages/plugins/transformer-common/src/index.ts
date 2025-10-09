import { z } from 'zod';
import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { DefaultTransformerPlugin } from './lib/transformer-common.plugin';
import { icon } from './lib/types';

const ConfigSchema = z.object({
});

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: '@xpert-ai/plugin-transformer-common',
    version: '1.0.0',
    category: 'tools',
    icon: {
      type: 'svg',
      value: icon
    },
    displayName: 'Common Transformer',
    description: 'Provide common transformation functionality',
    keywords: ['pdf', 'markdown', 'json', 'transformer'],
    author: 'XpertAI Team',
    homepage: 'https://xpertai.cloud',
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