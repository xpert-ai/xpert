import { XpertServerPlugin, type XpertPlugin } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import manifest from '../package.json'
import { ExecutionObservationMiddleware } from './middleware'
import { ExecutionObservationViewProvider } from './view.provider'
import { administratorTemplate } from './template'
import { appContribution } from './app-config'
import { NAMESPACE, FEATURE, ICON, APP_COVER, label } from './constants'

@XpertServerPlugin({ providers: [ExecutionObservationMiddleware, ExecutionObservationViewProvider] })
export class ExecutionObservabilityPlugin {}

const plugin: XpertPlugin = {
  meta: {
    name: manifest.name,
    version: manifest.version,
    level: 'system',
    artifactNamespace: NAMESPACE,
    category: 'middleware',
    author: 'XpertAI',
    icon: ICON,
    targetApps: ['xpert'],
    targetAppMeta: {
      xpert: {
        types: ['business-app', 'workbench-view', 'assistant-tool'],
        capabilities: [FEATURE],
        marketplace: {
          category: 'data-analytics',
          subcategory: 'middleware',
          screenshots: [APP_COVER],
          contents: [appContribution]
        }
      }
    },
    displayName: label('Execution observability', '执行总览'),
    description: label(manifest.description, '管理员专用的助手执行时间线与只读分析工具。')
  },
  config: { schema: z.object({}).strict() },
  templates: [administratorTemplate],
  register() {
    return { module: ExecutionObservabilityPlugin, global: true }
  }
}
export default plugin
