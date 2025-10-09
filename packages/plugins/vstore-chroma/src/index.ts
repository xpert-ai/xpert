import { z } from 'zod';
import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { ChromaPlugin } from './lib/chroma.plugin';
import { icon } from './lib/types';

const ConfigSchema = z.object({
});

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: '@xpert-ai/plugin-vstore-chroma',
    version: '1.0.0',
    category: 'vector-store',
    icon: {
      type: 'svg',
      value: icon
    },
    displayName: 'Chroma',
    description: 'Provide Chroma vector store functionality',
    keywords: ['chroma', 'vector', 'store'],
    author: 'XpertAI Team',
    homepage: 'https://xpertai.cloud',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register Chroma plugin');
    return { module: ChromaPlugin, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('Chroma plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('Chroma plugin stopped');
  },
};

export default plugin;