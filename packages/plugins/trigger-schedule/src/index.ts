import { z } from 'zod';
import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { TriggerSchedulePlugin } from './lib/trigger-schedule.plugin';
import { icon } from './lib/types';

const ConfigSchema = z.object({
});

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: '@xpert-ai/plugin-trigger-schedule',
    version: '1.0.0',
    category: 'set',
    icon: {
      type: 'svg',
      value: icon,
      color: '#14b8a6'
    },
    displayName: 'Trigger Schedule',
    description: 'Provide Trigger Schedule functionality',
    keywords: ['trigger', 'schedule'],
    author: 'XpertAI Team',
    homepage: 'https://xpertai.cloud',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register trigger schedule plugin');
    return { module: TriggerSchedulePlugin, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('trigger schedule plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('trigger schedule plugin stopped');
  },
};

export default plugin;