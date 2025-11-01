import { z } from 'zod';
import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { SvgIcon } from './types';
import { VLLMPlugin } from './vllm';

const ConfigSchema = z.object({
});

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: '@xpert-ai/plugin-vllm',
    version: '1.0.0',
    category: 'model',
    icon: {
      type: 'svg',
      value: SvgIcon
    },
    displayName: 'vLLM',
    description: 'Provide connector for vLLM models',
    keywords: ['vLLM', 'model'],
    author: 'XpertAI',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register VLLM plugin');
    return { module: VLLMPlugin, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('VLLM plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('VLLM plugin stopped');
  },
};

export default plugin;