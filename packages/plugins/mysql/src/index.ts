import { z } from 'zod';
import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { SvgIcon } from './lib/types';
import { MySQLPlugin } from './lib/mysql';

const ConfigSchema = z.object({
});

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: '@xpert-ai/plugin-mysql',
    version: '0.0.1',
    category: 'datasource',
    icon: {
      type: 'svg',
      value: SvgIcon,
      color: '#14b8a6'
    },
    displayName: 'MySQL Data Source',
    description: 'Provide MySQL database connectivity and querying capabilities',
    keywords: ['mysql', 'database', 'datasource'],
    author: 'XpertAI Team',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register mysql data source plugin');
    return { module: MySQLPlugin, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('mysql data source plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('mysql data source plugin stopped');
  },
};

export default plugin;