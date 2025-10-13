import { z } from 'zod';
import { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { FileSystemPlugin } from './lib/file-system.plugin';
import { svg } from './lib/types';

const ConfigSchema = z.object({
});

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: '@xpert-ai/plugin-file-system',
    version: '1.0.0',
    category: 'doc-source',
    icon: { type: 'svg', value: svg },
    displayName: 'Document File System',
    description: 'Provide Remote and Local File System Document Source functionality',
    keywords: ['smb', 'sftp', 'ftp', 'webdav', 'document source'],
    author: 'XpertAI Team',
    homepage: 'https://xpertai.cloud',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register file system plugin');
    return { module: FileSystemPlugin, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('file system plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('file system plugin stopped');
  },
};

export default plugin;