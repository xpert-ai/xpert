import { z } from 'zod';
import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { TriggerSchedulePlugin } from './lib/trigger-schedule.plugin';

const ConfigSchema = z.object({
});

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: '@xpert-ai/plugin-trigger-schedule',
    version: '1.0.0',
    displayName: 'Trigger Schedule',
    description: 'Provide Trigger Schedule functionality',
    keywords: ['trigger', 'schedule'],
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