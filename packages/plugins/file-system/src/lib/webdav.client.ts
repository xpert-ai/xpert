import https from 'https'
import { Document } from 'langchain/document'
import { createClient as createWebDAVClient, WebDAVClient as IWebDAVClient } from 'webdav'
import { FileSystemConfig } from './types'

export class WebdavClient {
  private client: IWebDAVClient

  constructor(private config: FileSystemConfig) {
    this.client = createWebDAVClient(`${config.https ? 'https' : 'http'}://${config.host}:${config.port ?? 80}`, {
      username: config.username,
      password: config.password,
      httpsAgent: new https.Agent({ rejectUnauthorized: !config.allowSelfSigned }) // allow self-signed
    })
  }

  /**
   * Create a Document object
   */
  private createDoc(
    content: string,
    name: string,
    path: string,
    size: number,
    lastModified: Date | undefined,
    type: 'file' | 'directory'
  ): Document {
    return new Document({
      pageContent: content,
      metadata: {
        name,
        path,
        size,
        lastModified,
        type,
        source: 'webdav'
      }
    })
  }

  /**
   * Read a single file content
   */
  async readFile(path: string): Promise<Document> {
    const stat = await this.client.stat(path)
    if ((stat as any).type === 'directory') {
      throw new Error(`'${path}' is a directory, not a file`)
    }
    const buffer = await this.client.getFileContents(path)
    return this.createDoc(
      buffer.toString('utf-8'),
      (stat as any).basename,
      path,
      (stat as any).size,
      (stat as any).lastmod ? new Date((stat as any).lastmod) : undefined,
      'file'
    )
  }

  /**
   * Recursively read directory contents (with maxDepth control)
   */
  async readDirectory(path: string, maxDepth: number = Infinity, currentDepth: number = 0): Promise<Document[]> {
    let stat = null
    try {
      stat = await this.client.stat(path)
    } catch (err) {
      // 如果是403错误，并且配置了skipForbidden，则跳过
      if (this.config.skipForbidden && (err as any).status === 403) {
        console.warn(`Skipping forbidden path: ${path}`)
        return []
      }
      throw err
    }

    const docs: Document[] = []

    const isDirectory = (stat as any).isDirectory?.() ?? (stat as any).type === 'directory'

    if (!isDirectory) {
        // file case (only metadata, no content read)
        docs.push(
            this.createDoc(
            '', // empty content
            (stat as any).basename,
            path,
            (stat as any).size,
            (stat as any).lastmod ? new Date((stat as any).lastmod) : undefined,
            'file'
            )
        );
        return docs;
    }

    // add directory node
    docs.push(
      this.createDoc(
        '',
        (stat as any).basename,
        path,
        (stat as any).size,
        (stat as any).lastmod ? new Date((stat as any).lastmod) : undefined,
        'directory'
      )
    )

    // stop recursion if depth reached
    if (currentDepth >= maxDepth) {
      return docs
    }

    // read directory contents
    const items = (await this.client.getDirectoryContents(path)) as any[]
    for (const item of items) {
      if (item.type === 'directory') {
        docs.push(...(await this.readDirectory(item.filename, maxDepth, currentDepth + 1)))
      } else {
        docs.push(
          this.createDoc(
            '',
            item.basename,
            item.filename,
            item.size,
            item.lastmod ? new Date(item.lastmod) : undefined,
            'file'
          )
        )
      }
    }

    return docs
  }

  /**
   * Auto-detect (file or directory) and load
   */
  async load(path: string, maxDepth: number = Infinity): Promise<Document[]> {
    const stat = await this.client.stat(path)
    const isDirectory = (stat as any).isDirectory?.() ?? (stat as any).type === 'directory'

    if (isDirectory) {
      return this.readDirectory(path, maxDepth, 0)
    }
    return [await this.readFile(path)]
  }
}
