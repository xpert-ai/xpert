import { z } from 'zod';
import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { UnstructuredPlugin } from './lib/unstructured.plugin';
import { icon } from './lib/types';

const ConfigSchema = z.object({
});

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: '@xpert-ai/plugin-transformer-unstructured',
    version: '1.0.0',
    category: 'set',
    icon: {
      type: 'svg',
      value: icon
    },
    displayName: 'Unstructured Transformer',
    description: 'Provide PDF to Markdown and JSON transformation functionality',
    keywords: ['pdf', 'markdown', 'json', 'transformer'],
    author: 'XpertAI Team',
    homepage: 'https://xpertai.cloud',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register unstructured transformer plugin');
    return { module: UnstructuredPlugin, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('unstructured transformer plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('unstructured transformer plugin stopped');
  },
};

export default plugin;