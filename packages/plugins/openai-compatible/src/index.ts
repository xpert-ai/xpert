import { z } from 'zod';
import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { readFileSync } from 'fs';
import { join } from 'path';
import { OpenAICompatiblePlugin } from './openai-compatible';

const ConfigSchema = z.object({
});

const svgIcon: string = readFileSync(join(__dirname, '_assets/icon.svg'), 'utf-8');

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
    meta: {
        name: '@xpert-ai/plugin-openai-compatible',
        version: '1.0.0',
        category: 'model',
        icon: {
            type: 'svg',
            value: svgIcon,
        },
        displayName: 'OpenAI Compatible',
        description: 'Provide connector for OpenAI models',
        keywords: ['OpenAI', 'model'],
        author: 'XpertAI',
    },
    config: {
        schema: ConfigSchema,
    },
    register(ctx) {
        ctx.logger.log('register OpenAICompatible plugin');
        return { module: OpenAICompatiblePlugin, global: true };
    },
    async onStart(ctx) {
        ctx.logger.log('OpenAICompatible plugin started');
    },
    async onStop(ctx) {
        ctx.logger.log('OpenAICompatible plugin stopped');
    },
};

export default plugin;