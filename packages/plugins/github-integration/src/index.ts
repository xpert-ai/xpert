import { XpertServerPlugin, type XpertPlugin } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import manifest from '../package.json'
import { GitHubIntegrationStrategy } from './github.strategy'

@XpertServerPlugin({ providers: [GitHubIntegrationStrategy], exports: [GitHubIntegrationStrategy] })
export class GitHubIntegrationPlugin {}

const plugin: XpertPlugin = {
  meta: {
    name: manifest.name,
    version: manifest.version,
    level: 'system',
    artifactNamespace: manifest.xpert.plugin.artifactNamespace,
    category: 'integration',
    author: 'XpertAI',
    displayName: { en_US: 'GitHub System Integration', zh_Hans: 'GitHub 系统集成' },
    description: { en_US: manifest.description, zh_Hans: '管理 GitHub App 配置，供连接器和代码审查复用。' }
  },
  config: { schema: z.object({}).strict() },
  register() {
    return { module: GitHubIntegrationPlugin, global: true }
  }
}
export default plugin
export { GitHubIntegrationStrategy } from './github.strategy'
