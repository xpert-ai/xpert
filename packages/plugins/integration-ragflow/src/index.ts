import { z } from 'zod';
import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { IntegrationRAGFlowPlugin } from './lib/integration-ragflow.plugin';

const ConfigSchema = z.object({
});

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: '@xpert-ai/plugin-integration-ragflow',
    version: '1.0.0',
    category: 'integration',
    icon: {
      type: 'image',
      value: `/assets/images/integrations/ragflow.svg`
    },
    displayName: 'RAGFlow Integration',
    description: 'Provide RAGFlow integration strategy',
    keywords: ['integration', 'ragflow'],
    author: 'XpertAI Team',
    homepage: 'https://xpertai.cloud',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register ragflow plugin');
    return { module: IntegrationRAGFlowPlugin, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('ragflow plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('ragflow plugin stopped');
  },
};

export default plugin;