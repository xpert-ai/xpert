import { z } from 'zod';
import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { CommonRetrieverPlugin } from './lib/retriever.plugin';

const ConfigSchema = z.object({
});

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: '@xpert-ai/plugin-retriever-common',
    version: '1.0.0',
    category: 'tools',
    icon: {
      type: 'image',
      value: `/assets/images/plugins/retriever-common.svg`
    },
    displayName: 'Common Retriever',
    description: 'Provide common retrieval functionality',
    keywords: ['retriever', 'rag'],
    author: 'XpertAI Team',
    homepage: 'https://xpertai.cloud',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register common retriever plugin');
    return { module: CommonRetrieverPlugin, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('common retriever plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('common retriever plugin stopped');
  },
};

export default plugin;