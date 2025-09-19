import { z } from 'zod';
import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { FileSystemPlugin } from './lib/file-system.plugin';

const ConfigSchema = z.object({
});

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: '@xpert-ai/plugin-file-system',
    version: '1.0.0',
    displayName: 'Document File System',
    description: 'Provide Remote and Local File System Document Source functionality',
    keywords: ['local', 'smb', 'sftp', 'ftp', 'webdav', 'file system', 'document source'],
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