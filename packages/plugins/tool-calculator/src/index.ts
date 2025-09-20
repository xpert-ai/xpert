import { z } from 'zod';
import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { CalculatorPlugin } from './lib/calculator.plugin';

const ConfigSchema = z.object({
});

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: '@xpert-ai/plugin-tool-calculator',
    version: '1.0.0',
    displayName: 'Calculator',
    description: 'Provide calculator functionality',
    keywords: ['calculator', 'math', 'operations'],
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