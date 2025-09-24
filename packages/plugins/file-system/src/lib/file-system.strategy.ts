import { I18nObject } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { DocumentSourceStrategy, IDocumentSourceStrategy } from '@xpert-ai/plugin-sdk'
import { Document } from 'langchain/document'

import * as ftp from 'basic-ftp'
import * as fs from 'fs/promises'
import * as path from 'path'
import SMB2 from 'smb2'
import * as SftpClient from 'ssh2-sftp-client'
import { FileSystem, FileSystemConfig } from './types'
import { WebdavClient } from './webdav.client'

@DocumentSourceStrategy(FileSystem)
@Injectable()
export class FileSystemStrategy implements IDocumentSourceStrategy<FileSystemConfig> {
  readonly meta = {
    name: FileSystem,
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
      svg: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="5.48 7.13 39.59 39.5"><defs><linearGradient id="d"><stop offset="0" style="stop-color:black;stop-opacity:1"/><stop offset="1" style="stop-color:black;stop-opacity:0"/></linearGradient><linearGradient id="a"><stop offset="0" style="stop-color:black;stop-opacity:0"/><stop offset=".5" style="stop-color:black;stop-opacity:1"/><stop offset="1" style="stop-color:black;stop-opacity:0"/></linearGradient><linearGradient xlink:href="#a" id="e" x1="302.857" x2="302.857" y1="366.648" y2="609.505" gradientTransform="matrix(2.77439 0 0 1.9697 -1892.179 -872.885)" gradientUnits="userSpaceOnUse"/><linearGradient id="c"><stop offset="0" style="stop-color:#b47002;stop-opacity:1"/><stop offset="1" style="stop-color:#6b4301;stop-opacity:1"/></linearGradient><linearGradient id="b"><stop offset="0" style="stop-color:#fff;stop-opacity:1"/><stop offset="1" style="stop-color:#fff;stop-opacity:0"/></linearGradient><linearGradient xlink:href="#b" id="h" x1="14.681" x2="38.694" y1="7.219" y2="57.469" gradientUnits="userSpaceOnUse"/><linearGradient xlink:href="#c" id="i" x1="25.25" x2="25.25" y1="23.568" y2="19.169" gradientUnits="userSpaceOnUse"/><linearGradient xlink:href="#c" id="j" x1="25.25" x2="25.25" y1="23.568" y2="19.169" gradientTransform="translate(0 13.113)" gradientUnits="userSpaceOnUse"/><radialGradient xlink:href="#d" id="g" cx="605.714" cy="486.648" r="117.143" fx="605.714" fy="486.648" gradientTransform="matrix(-2.77439 0 0 1.9697 112.762 -872.885)" gradientUnits="userSpaceOnUse"/><radialGradient xlink:href="#d" id="f" cx="605.714" cy="486.648" r="117.143" fx="605.714" fy="486.648" gradientTransform="matrix(2.77439 0 0 1.9697 -1891.633 -872.885)" gradientUnits="userSpaceOnUse"/></defs><path d="M-1559.252-150.697h1339.633V327.66h-1339.633z" style="opacity:.40206185;color:#000;fill:url(#e);fill-opacity:1;fill-rule:nonzero;stroke:none;stroke-width:1;stroke-linecap:round;stroke-linejoin:miter;marker:none;marker-start:none;marker-mid:none;marker-end:none;stroke-miterlimit:4;stroke-dasharray:none;stroke-dashoffset:0;stroke-opacity:1;visibility:visible;display:inline;overflow:visible" transform="matrix(.0195 0 0 .02087 42.619 39.79)"/><path d="M-219.619-150.68v478.33c142.874.9 345.4-107.17 345.4-239.196S-33.655-150.68-219.619-150.68" style="opacity:.40206185;color:#000;fill:url(#f);fill-opacity:1;fill-rule:nonzero;stroke:none;stroke-width:1;stroke-linecap:round;stroke-linejoin:miter;marker:none;marker-start:none;marker-mid:none;marker-end:none;stroke-miterlimit:4;stroke-dasharray:none;stroke-dashoffset:0;stroke-opacity:1;visibility:visible;display:inline;overflow:visible" transform="matrix(.0195 0 0 .02087 42.619 39.79)"/><path d="M-1559.252-150.68v478.33c-142.875.9-345.4-107.17-345.4-239.196s159.436-239.134 345.4-239.134" style="opacity:.40206185;color:#000;fill:url(#g);fill-opacity:1;fill-rule:nonzero;stroke:none;stroke-width:1;stroke-linecap:round;stroke-linejoin:miter;marker:none;marker-start:none;marker-mid:none;marker-end:none;stroke-miterlimit:4;stroke-dasharray:none;stroke-dashoffset:0;stroke-opacity:1;visibility:visible;display:inline;overflow:visible" transform="matrix(.0195 0 0 .02087 42.619 39.79)"/><path d="M10.625 11.625v31h29v-31l-4-4h-21z" style="stroke-opacity:1;stroke-linejoin:round;stroke-linecap:round;stroke-width:1px;stroke:#444329;fill-rule:evenodd;fill-opacity:1;fill:#c17d11"/><path d="m14.85 8.225-3.724 3.816 1.189.25h25.814l1.001-.25-3.863-3.816z" style="stroke-opacity:1;stroke-linejoin:miter;stroke-linecap:butt;stroke-width:1px;stroke:none;fill-rule:evenodd;fill-opacity:1;fill:#e9b96e"/><rect width="21" height="10.055" x="14.75" y="28.828" rx=".929" ry=".929" style="opacity:1;color:#000;fill:#e9b96e;fill-opacity:1;fill-rule:evenodd;stroke:#e9b96e;stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;marker:none;marker-start:none;marker-mid:none;marker-end:none;stroke-miterlimit:4;stroke-dasharray:none;stroke-dashoffset:0;stroke-opacity:1;visibility:visible;display:inline;overflow:visible;font-family:Bitstream Vera Sans"/><rect width="21" height="10.055" x="14.573" y="28.475" rx=".929" ry=".929" style="opacity:1;color:#000;fill:#b67610;fill-opacity:1;fill-rule:evenodd;stroke:#7b500b;stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;marker:none;marker-start:none;marker-mid:none;marker-end:none;stroke-miterlimit:4;stroke-dasharray:none;stroke-dashoffset:0;stroke-opacity:1;visibility:visible;display:inline;overflow:visible;font-family:Bitstream Vera Sans"/><path d="M11.68 12.062v29.59h26.89v-29.59L35.166 8.66H15.083z" style="stroke-opacity:1;stroke-linejoin:miter;stroke-linecap:butt;stroke-width:1;stroke:url(#h);fill-rule:evenodd;fill-opacity:1;fill:none;stroke-dasharray:none;stroke-miterlimit:4"/><rect width="21" height="10.055" x="14.75" y="15.716" rx=".929" ry=".929" style="opacity:1;color:#000;fill:#e9b96e;fill-opacity:1;fill-rule:evenodd;stroke:#e9b96e;stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;marker:none;marker-start:none;marker-mid:none;marker-end:none;stroke-miterlimit:4;stroke-dasharray:none;stroke-dashoffset:0;stroke-opacity:1;visibility:visible;display:inline;overflow:visible;font-family:Bitstream Vera Sans"/><rect width="21" height="10.055" x="14.573" y="15.362" rx=".929" ry=".929" style="font-family:Bitstream Vera Sans;overflow:visible;display:inline;visibility:visible;stroke-opacity:1;stroke-dashoffset:0;stroke-dasharray:none;stroke-miterlimit:4;marker-end:none;marker-mid:none;marker-start:none;marker:none;stroke-linejoin:round;stroke-linecap:round;stroke-width:1px;stroke:#7b500b;fill-rule:evenodd;fill-opacity:1;fill:#b67610;color:#000;opacity:1"/><rect width="6.747" height="3.822" x="21.744" y="21.569" rx=".287" ry=".337" style="opacity:1;color:#000;fill:url(#i);fill-opacity:1;fill-rule:evenodd;stroke:#7b500b;stroke-width:.99999923px;stroke-linecap:round;stroke-linejoin:round;marker:none;marker-start:none;marker-mid:none;marker-end:none;stroke-miterlimit:4;stroke-dasharray:none;stroke-dashoffset:0;stroke-opacity:1;visibility:visible;display:inline;overflow:visible;font-family:Bitstream Vera Sans"/><rect width="6.747" height="3.822" x="21.744" y="34.682" rx=".287" ry=".337" style="opacity:1;color:#000;fill:url(#j);fill-opacity:1;fill-rule:evenodd;stroke:#7b500b;stroke-width:.99999923px;stroke-linecap:round;stroke-linejoin:round;marker:none;marker-start:none;marker-mid:none;marker-end:none;stroke-miterlimit:4;stroke-dasharray:none;stroke-dashoffset:0;stroke-opacity:1;visibility:visible;display:inline;overflow:visible;font-family:Bitstream Vera Sans"/></svg>`,
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
