import { z } from 'zod';
import { type XpertPlugin } from '@xpert-ai/plugin-sdk';
import { LarkModule } from './lib/lark.module';
import { initI18n } from './lib/i18n';

const ConfigSchema = z.object({
});

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: '@xpert-ai/plugin-lark',
    version: '1.0.0',
    category: 'doc-source',
    icon: {
      type: 'svg',
      value: ``
    },
    displayName: 'Lark Plugin',
    description: 'Integrate Lark functionality',
    keywords: ['lark', 'feishu', 'document source'],
    author: 'Xpert AI team',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register lark plugin');
    initI18n(__dirname)
    return { module: LarkModule, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('lark plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('lark plugin stopped');
  },
};

export default plugin;