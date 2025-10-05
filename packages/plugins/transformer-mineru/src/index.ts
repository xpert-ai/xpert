import { z } from 'zod';
import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { MinerUPlugin } from './lib/mineru.plugin';

const ConfigSchema = z.object({
});

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: '@xpert-ai/plugin-transformer-mineru',
    version: '1.0.0',
    displayName: 'MinerU Transformer',
    description: 'Provide PDF to Markdown and JSON transformation functionality',
    keywords: ['integration', 'pdf', 'markdown', 'json', 'transformer'],
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register mineru transformer plugin');
    return { module: MinerUPlugin, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('mineru transformer plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('mineru transformer plugin stopped');
  },
};

export default plugin;