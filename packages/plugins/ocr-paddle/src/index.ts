import { z } from 'zod';
import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { PaddleOCRPlugin } from './lib/paddle-ocr.plugin';
import { svg } from './lib/types';

const ConfigSchema = z.object({
});

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: '@xpert-ai/plugin-ocr-paddle',
    version: '1.0.0',
    category: 'integration',
    icon: {
      type: 'svg',
      value: svg
    },
    displayName: 'PaddleOCR',
    description: 'Provide OCR functionality using Paddle',
    keywords: ['pdf', 'markdown', 'json', 'ocr', 'paddle'],
    author: 'XpertAI Team',
    homepage: 'https://xpertai.cloud',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register paddle ocr plugin');
    return { module: PaddleOCRPlugin, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('paddle ocr plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('paddle ocr plugin stopped');
  },
};

export default plugin;