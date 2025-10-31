import { z } from 'zod';
import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { VolcenginePlugin } from './volcengine';
import { SvgIcon } from './types';

const ConfigSchema = z.object({
});

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: '@xpert-ai/plugin-volcengine',
    version: '1.0.0',
    category: 'model',
    icon: {
      type: 'svg',
      value: SvgIcon
    },
    displayName: 'volcengine',
    description: 'Provide VLM functionality using default settings',
    keywords: ['pdf', 'markdown', 'json', 'vlm', 'default'],
    author: 'XpertAI Team',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register volcengine plugin');
    return { module: VolcenginePlugin, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('volcengine plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('volcengine plugin stopped');
  },
};

export default plugin;