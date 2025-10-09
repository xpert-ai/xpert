import { z } from 'zod';
import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { CalculatorPlugin } from './lib/calculator.plugin';
import { icon } from './lib/types';

const ConfigSchema = z.object({
});

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: '@xpert-ai/plugin-tool-calculator',
    version: '1.0.0',
    category: 'tools',
    icon: {
      type: 'image',
      value: icon
    },
    displayName: 'Calculator',
    description: 'Provide calculator functionality',
    keywords: ['calculator', 'math', 'operations'],
    author: 'XpertAI Team',
    homepage: 'https://xpertai.cloud',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register calculator plugin');
    return { module: CalculatorPlugin, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('calculator plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('calculator plugin stopped');
  },
};

export default plugin;