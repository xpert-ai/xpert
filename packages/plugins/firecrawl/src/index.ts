import { z } from 'zod';
import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { FirecrawlPlugin } from './lib/firecrawl.plugin';

const ConfigSchema = z.object({
});

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: '@xpert-ai/plugin-firecrawl',
    version: '1.0.0',
    displayName: 'Firecrawl',
    description: 'Integrate Firecrawl system functionality',
    keywords: ['firecrawl', 'document source', 'toolset'],
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register firecrawl plugin');
    return { module: FirecrawlPlugin, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('firecrawl plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('firecrawl plugin stopped');
  },
};

export default plugin;