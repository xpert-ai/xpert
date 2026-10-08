import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { LocalShellSandboxProvider } from './lib/local-shell-sandbox.provider'

export const PLUGIN_ARTIFACT_NAMESPACE = 'local_shell_sandbox'

@XpertServerPlugin({ providers: [LocalShellSandboxProvider], exports: [LocalShellSandboxProvider] })
export class LocalShellSandboxPlugin {}

const plugin: XpertPlugin = {
  meta: {
    name: '@xpert-ai/plugin-local-shell-sandbox',
    version: '0.2.0',
    level: 'system',
    artifactNamespace: PLUGIN_ARTIFACT_NAMESPACE,
    category: 'integration',
    author: 'XpertAI',
    displayName: { en_US: 'Local Shell Sandbox', zh_Hans: '本地 Shell 沙盒' },
    description: {
      en_US: 'Run commands and interactive terminals on the API host.',
      zh_Hans: '在 API 主机上执行命令并使用交互式终端。'
    }
  },
  config: { schema: z.object({}) },
  register() {
    return { module: LocalShellSandboxPlugin, global: true }
  }
}

export default plugin
export { LocalShellSandbox, LocalShellSandboxProvider } from './lib/local-shell-sandbox.provider'
