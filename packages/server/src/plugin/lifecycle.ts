import type { INestApplicationContext } from '@nestjs/common';
import { createPluginLogger } from '@xpert-ai/plugin-sdk';
import type { PluginContext } from '@xpert-ai/plugin-sdk';

export function createPluginContext<TConfig extends object>(
  app: INestApplicationContext,
  name: string,
  config: TConfig,
): PluginContext<TConfig> {
  return {
    app,
    config,
    logger: createPluginLogger(`plugin:${name}`),
    resolve: (token: any) => app.get(token, { strict: false }),
  };
}