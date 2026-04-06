import { z } from 'zod'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { FileMemoryPluginModule } from './lib/file-memory.module'

const ConfigSchema = z.object({})

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: '@xpert-ai/plugin-file-memory',
    version: '0.0.1',
    level: 'system',
    category: 'set',
    displayName: 'Built-in File Memory',
    description: 'Owns the built-in layered file-memory core for Xpert.',
    keywords: ['memory', 'file-memory', 'xpert'],
    author: 'XpertAI Team'
  },
  config: {
    schema: ConfigSchema
  },
  register(ctx) {
    ctx.logger.log('register file-memory plugin')
    return { module: FileMemoryPluginModule, global: true }
  }
}

export default plugin
