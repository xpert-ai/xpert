import { DocumentSourceProviderCategoryEnum, I18nObject } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { DocumentSourceStrategy, IDocumentSourceStrategy } from '@xpert-ai/plugin-sdk'
import { Document } from 'langchain/document'

import * as ftp from 'basic-ftp'
import * as fs from 'fs/promises'
import * as path from 'path'
import SMB2 from 'smb2'
import * as SftpClient from 'ssh2-sftp-client'
import { FileSystem, FileSystemConfig, svg } from './types'
import { WebdavClient } from './webdav.client'

@DocumentSourceStrategy(FileSystem)
@Injectable()
export class FileSystemStrategy implements IDocumentSourceStrategy<FileSystemConfig> {
  readonly permissions = []
  readonly meta = {
    name: FileSystem,
    category: DocumentSourceProviderCategoryEnum.RemoteFile,
    label: {
      en_US: 'File System',
      zh_Hans: '文件系统'
    } as I18nObject,
    configSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['local', 'ftp', 'sftp', 'smb', 'webdav'],
          default: 'local',
          title: {
            en_US: 'File System Type',
            zh_Hans: '文件系统类型'
          },
          description: {
            en_US: 'Type of the file system to connect to',
            zh_Hans: '要连接的文件系统类型'
          }
        },
        filePath: {
          type: 'string',
          title: {
            en_US: 'File Path',
            zh_Hans: '文件路径'
          },
          description: {
            en_US: 'Path to the file to load (absolute path for local, path on server for remote)',
            zh_Hans: '要加载的文件路径（本地的绝对路径，远程服务器上的路径）'
          }
        },
        host: {
          type: 'string',
          title: {
            en_US: 'Host',
            zh_Hans: '主机'
          },
          description: {
            en_US: 'Remote server host (for remote file systems)',
            zh_Hans: '远程服务器主机（用于远程文件系统）'
          }
        },
        port: {
          type: 'number',
          title: {
            en_US: 'Port',
            zh_Hans: '端口'
          },
          description: {
            en_US: 'Remote server port (for remote file systems)',
            zh_Hans: '远程服务器端口（用于远程文件系统）'
          }
        },
        username: {
          type: 'string',
          title: {
            en_US: 'Username',
            zh_Hans: '用户名'
          },
          description: { en_US: 'Username (for remote file systems)', zh_Hans: '用户名（用于远程文件系统）' }
        },
        password: {
          type: 'string',
          title: {
            en_US: 'Password',
            zh_Hans: '密码'
          },
          description: { en_US: 'Password (for remote file systems)', zh_Hans: '密码（用于远程文件系统）' }
        },
        https: {
          type: 'boolean',
          title: {
            en_US: 'Use HTTPS',
            zh_Hans: '使用 HTTPS'
          },
          description: { en_US: 'Use HTTPS (for WebDAV)', zh_Hans: '使用 HTTPS（用于 WebDAV）' }
        },
        allowSelfSigned: {
          type: 'boolean',
          title: {
            en_US: 'Allow Self-Signed Certificate',
            zh_Hans: '允许自签名证书'
          },
          description: {
            en_US: 'Allow self-signed certificate (for WebDAV)',
            zh_Hans: '允许自签名证书（用于 WebDAV）'
          }
        },
        skipForbidden: {
          type: 'boolean',
          title: {
            en_US: 'Skip Forbidden',
            zh_Hans: '跳过403错误'
          },
          description: {
            en_US: 'Skip 403 Forbidden errors when reading directories (for WebDAV)',
            zh_Hans: '读取目录时跳过403禁止错误（用于 WebDAV）'
          }
        }
      },
      required: ['type', 'filePath']
    },
    icon: {
      svg,
      color: '#4CAF50'
    }
  }

  async validateConfig(config: FileSystemConfig): Promise<void> {
    if (!config.type) throw new Error('type is required')
    if (!config.filePath) throw new Error('filePath is required')

    if (config.type !== 'local') {
      if (!config.host) throw new Error('host is required for remote file systems')
      if (!config.username) throw new Error('username is required for remote file systems')
      if (!config.password) throw new Error('password is required for remote file systems')
    }
  }

  async test(config: FileSystemConfig): Promise<any> {
    await this.validateConfig(config)
    switch (config.type) {
      case 'local':
        return this.loadFromLocal(config, config.filePath)
      case 'sftp':
        return this.loadFromSftp(config, config.filePath)
      case 'ftp':
        return this.loadFromFtp(config, config.filePath)
      case 'smb':
        return this.loadFromSmb(config, config.filePath)
      case 'webdav': {
        const client = new WebdavClient(config)
        const stat = await client.readDirectory(config.filePath, 1)
        return stat
      }
      default:
        throw new Error(`Unsupported file system type: ${config.type}`)
    }
  }

  async loadDocuments(config: FileSystemConfig): Promise<Document[]> {
    switch (config.type) {
      case 'local':
        return this.loadFromLocal(config, config.filePath)
      case 'sftp':
        return this.loadFromSftp(config, config.filePath)
      case 'ftp':
        return this.loadFromFtp(config, config.filePath)
      case 'smb':
        return this.loadFromSmb(config, config.filePath)
      case 'webdav': {
        const client = new WebdavClient(config)
        const stat = await client.readDirectory(config.filePath, 1)
        return stat
      }
      default:
        throw new Error(`Unsupported file system type: ${config.type}`)
    }
  }

  private createDoc(
    content: string,
    config: FileSystemConfig,
    filePath: string,
    size?: number,
    modifiedAt?: Date,
    kind: 'file' | 'directory' = 'file'
  ): Document {
    return new Document({
      pageContent: content,
      metadata: {
        source: 'file-system',
        system: config.type,
        path: filePath,
        size,
        modifiedAt,
        kind
      }
    })
  }

  /* ---------- Local ---------- */
  private async loadFromLocal(config: FileSystemConfig, targetPath: string): Promise<Document[]> {
    const stats = await fs.stat(targetPath)
    const docs: Document[] = []

    if (stats.isDirectory()) {
      docs.push(this.createDoc('', config, targetPath, stats.size, stats.mtime, 'directory'))
      const entries = await fs.readdir(targetPath)
      for (const f of entries) {
        const fullPath = path.join(targetPath, f)
        docs.push(...(await this.loadFromLocal(config, fullPath)))
      }
    } else {
      const content = await fs.readFile(targetPath, 'utf-8')
      docs.push(this.createDoc(content, config, targetPath, stats.size, stats.mtime, 'file'))
    }
    return docs
  }

  /* ---------- SFTP ---------- */
  private async loadFromSftp(config: FileSystemConfig, targetPath: string): Promise<Document[]> {
    const sftp = new SftpClient()
    await sftp.connect({
      host: config.host,
      port: config.port ?? 22,
      username: config.username,
      password: config.password
    })
    try {
      const stats = await sftp.stat(targetPath)
      const docs: Document[] = []

      if (stats.isDirectory) {
        docs.push(
          this.createDoc(
            '',
            config,
            targetPath,
            stats.size,
            stats.modifyTime ? new Date(stats.modifyTime) : undefined,
            'directory'
          )
        )
        const list = await sftp.list(targetPath)
        for (const f of list) {
          const remotePath = path.posix.join(targetPath, f.name)
          if (f.type === 'd') {
            docs.push(...(await this.loadFromSftp(config, remotePath)))
          } else {
            const buffer = await sftp.get(remotePath)
            docs.push(
              this.createDoc(
                buffer.toString('utf-8'),
                config,
                remotePath,
                f.size,
                f.modifyTime ? new Date(f.modifyTime) : undefined,
                'file'
              )
            )
          }
        }
      } else {
        const buffer = await sftp.get(targetPath)
        docs.push(
          this.createDoc(
            buffer.toString('utf-8'),
            config,
            targetPath,
            stats.size,
            stats.modifyTime ? new Date(stats.modifyTime) : undefined,
            'file'
          )
        )
      }
      return docs
    } finally {
      sftp.end()
    }
  }

  /* ---------- FTP ---------- */
  private async loadFromFtp(config: FileSystemConfig, targetPath: string): Promise<Document[]> {
    const client = new ftp.Client()
    await client.access({
      host: config.host,
      port: config.port ?? 21,
      user: config.username,
      password: config.password,
      secure: false
    })
    try {
      const list = await client.list(targetPath)
      const docs: Document[] = []

      // 如果 targetPath 是文件
      // if (list.length === 1 && list[0].isFile) {
      //   const chunks: Buffer[] = [];
      //   await client.downloadTo((chunk) => chunks.push(chunk), targetPath);
      //   docs.push(this.createDoc(Buffer.concat(chunks).toString('utf-8'), config, targetPath, list[0].size, list[0].rawModifiedAt, 'file'));
      //   return docs;
      // }

      // // 目录
      // docs.push(this.createDoc('', config, targetPath, undefined, undefined, 'directory'));
      // for (const f of list) {
      //   const remotePath = path.posix.join(targetPath, f.name);
      //   if (f.isDirectory) {
      //     docs.push(...(await this.loadFromFtp(config, remotePath)));
      //   } else {
      //     const chunks: Buffer[] = [];
      //     await client.downloadTo((chunk) => chunks.push(chunk), remotePath);
      //     docs.push(this.createDoc(Buffer.concat(chunks).toString('utf-8'), config, remotePath, f.size, f.rawModifiedAt, 'file'));
      //   }
      // }
      return docs
    } finally {
      client.close()
    }
  }

  /* ---------- SMB ---------- */
  private async loadFromSmb(config: FileSystemConfig, targetPath: string): Promise<Document[]> {
    const smb2Client = new SMB2({
      share: `\\\\${config.host}\\${config.filePath.split('/')[0]}`,
      username: config.username,
      password: config.password,
      port: config.port ?? 445
    })

    const docs: Document[] = []
    return new Promise((resolve, reject) => {
      smb2Client.readdir(targetPath, async (err: any, files: string[]) => {
        if (err) {
          // 单文件
          smb2Client.readFile(targetPath, (err2: any, data: Buffer) => {
            if (err2) return reject(err2)
            resolve([this.createDoc(data.toString('utf-8'), config, targetPath, undefined, undefined, 'file')])
          })
        } else {
          docs.push(this.createDoc('', config, targetPath, undefined, undefined, 'directory'))
          const tasks = files.map(async (f) => {
            const remotePath = path.posix.join(targetPath, f)
            try {
              return await this.loadFromSmb(config, remotePath)
            } catch (e) {
              return []
            }
          })
          const results = await Promise.all(tasks)
          resolve(docs.concat(...results))
        }
      })
    })
  }
}
