import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { codingProjectConfigurationSchema } from './project-configuration'
import { z } from 'zod/v3'
import manifest from '../package.json'
import { PLUGIN_NAME, NAMESPACE, FEATURE, label } from './constants'
import { configSchema, CONFIG_READER } from './schemas'
import { CodingProjectModule } from './coding-project.module'
import { deliveryTemplate } from './template'

const plugin: XpertPlugin<z.input<typeof configSchema>> = {
  meta: {
    name: PLUGIN_NAME,
    version: manifest.version,
    level: 'system',
    artifactNamespace: NAMESPACE,
    category: 'middleware',
    author: 'XpertAI',
    displayName: label('Coding Projects', '编码项目'),
    description: label(manifest.description, '编码项目、独立验收、人工发布确认与跨实例交付流水线。'),
    targetApps: ['xpert'],
    targetAppMeta: {
      xpert: {
        types: ['business-app', 'assistant-tool'],
        capabilities: [FEATURE],
        marketplace: {
          category: 'developer-tools',
          contents: [
            {
              type: 'app',
              name: 'coding',
              displayName: label('Coding Projects', '编码项目'),
              projectTypes: [
                {
                  key: 'coding',
                  title: label('Coding project', '编码项目'),
                  binding: { kind: 'project' },
                  configuration: { schema: codingProjectConfigurationSchema }
                }
              ]
            }
          ]
        }
      }
    }
  },
  config: { schema: configSchema, defaults: { targets: [], repositories: [] } },
  templates: [deliveryTemplate],
  register(ctx) {
    return {
      module: CodingProjectModule,
      global: true,
      providers: [
        {
          provide: CONFIG_READER,
          useValue: async () => configSchema.parse(ctx.readConfig ? await ctx.readConfig() : ctx.config)
        }
      ]
    }
  }
}
export default plugin
