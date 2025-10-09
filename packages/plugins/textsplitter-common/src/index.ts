import { z } from 'zod';
import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { TextSplitterPlugin } from './lib/textsplitter.plugin';
import { svg } from './lib/types';

const ConfigSchema = z.object({
});

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: '@xpert-ai/plugin-textsplitter-common',
    version: '1.0.0',
    category: 'tools',
    icon: {
      type: 'svg',
      value: svg,
      color: '#14b8a6'
    },
    displayName: 'Common Text Splitter',
    description: 'Provide Text Splitting common functionality',
    keywords: ['text', 'splitter'],
    author: 'XpertAI Team',
    homepage: 'https://xpertai.cloud',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register text splitter plugin');
    return { module: TextSplitterPlugin, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('text splitter plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('text splitter plugin stopped');
  },
};

export default plugin;