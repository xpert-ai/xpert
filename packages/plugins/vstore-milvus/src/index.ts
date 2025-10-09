import { z } from 'zod';
import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { MilvusPlugin } from './lib/milvus.plugin';
import { icon } from './lib/types';

const ConfigSchema = z.object({
});

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: '@xpert-ai/plugin-vstore-milvus',
    version: '1.0.0',
    category: 'vector-store',
    icon: {
      type: 'svg',
      value: icon
    },
    displayName: 'Milvus',
    description: 'Provide Milvus vector store functionality',
    keywords: ['milvus', 'vector', 'store'],
    author: 'XpertAI Team',
    homepage: 'https://xpertai.cloud',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register Milvus plugin');
    return { module: MilvusPlugin, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('Milvus plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('Milvus plugin stopped');
  },
};

export default plugin;