import { z } from 'zod';
import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { WeaviatePlugin } from './lib/weaviate.plugin';

const ConfigSchema = z.object({
});

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: '@xpert-ai/plugin-vstore-weaviate',
    version: '1.0.0',
    displayName: 'Weaviate',
    description: 'Provide Weaviate vector store functionality',
    keywords: ['weaviate', 'vector', 'store'],
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register Weaviate plugin');
    return { module: WeaviatePlugin, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('Weaviate plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('Weaviate plugin stopped');
  },
};

export default plugin;