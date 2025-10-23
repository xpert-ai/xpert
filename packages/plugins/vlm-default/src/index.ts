import { z } from 'zod';
import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { VlmDefaultPlugin } from './lib/vlm.plugin';
import { SvgIcon } from './lib/types';

const ConfigSchema = z.object({
});

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: '@xpert-ai/plugin-vlm-default',
    version: '1.0.0',
    category: 'vlm',
    icon: {
      type: 'svg',
      value: SvgIcon
    },
    displayName: 'VLM Default',
    description: 'Provide VLM functionality using default settings',
    keywords: ['pdf', 'markdown', 'json', 'vlm', 'default'],
    author: 'XpertAI Team',
    homepage: 'https://xpertai.cloud',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register VLM default plugin');
    return { module: VlmDefaultPlugin, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('vlm default plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('vlm default plugin stopped');
  },
};

export default plugin;