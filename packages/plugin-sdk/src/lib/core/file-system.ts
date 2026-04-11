import fsPromises from 'fs/promises'
import path from 'path'
import { FileSystemPermission } from './permissions'


/**
 * Restricted FileSystem based on granted permissions
 */
export class XpFileSystem {
  private allowedOps: Set<'read' | 'write' | 'delete' | 'list'>
  private scope: string[] | undefined

  constructor(permission: FileSystemPermission, private basePath: string, private baseUrl: string) {
    this.allowedOps = new Set(permission.operations)
    this.scope = permission.scope
  }

  /**
   * Check if operation is allowed
   */
  private ensureAllowed(op: 'read' | 'write' | 'delete' | 'list') {
    if (!this.allowedOps.has(op)) {
      throw new Error(`Permission denied: ${op} operation not allowed`)
    }
  }

  /**
   * Check if path is within scope
   */
  private ensureInScope(targetPath: string) {
    if (!this.scope || this.scope.length === 0) return
    const resolved = path.resolve(targetPath)
    for (const s of this.scope) {
      const absScope = path.resolve(s)
      if (resolved.startsWith(absScope)) return
    }
    throw new Error(`Permission denied: path "${targetPath}" is out of scope`)
  }

  /**
   * Get the absolute path of file in the file system.
   * 
   * @param filePath Relative file path
   * @returns Absolute file path
   */
  fullPath(filePath: string): string {
    return path.join(this.basePath, filePath)
  }

  /**
   * Get web url for a given file path in the file system.
   * 
   * @param filePath Relative file path
   * @returns Web URL of file
   */
  fullUrl(filePath: string): string {
    return this.buildUrl(filePath)
  }

  /**
   * Read file contents
   */
  async readFile(filePath: string, encoding: BufferEncoding = 'utf-8') {
    this.ensureAllowed('read')
    const fullPath = this.fullPath(filePath)
    this.ensureInScope(fullPath)
    return await fsPromises.readFile(fullPath)
  }

  /**
   * Write file contents
   */
  async writeFile(filePath: string, content: string | Buffer): Promise<string> {
    this.ensureAllowed('write')
    const fullPath = this.fullPath(filePath)
    this.ensureInScope(fullPath)
    await fsPromises.mkdir(path.dirname(fullPath), { recursive: true })
    await fsPromises.writeFile(fullPath, content)
    return this.buildUrl(filePath)
  }

  /**
   * Delete a file
   */
  async deleteFile(filePath: string): Promise<void> {
    this.ensureAllowed('delete')
    this.ensureInScope(filePath)
    await fsPromises.unlink(filePath)
  }

  /**
   * List directory contents
   */
  async listDir(dirPath: string): Promise<string[]> {
    this.ensureAllowed('list')
    this.ensureInScope(dirPath)
    return fsPromises.readdir(dirPath)
  }

  /**
   * Utility: check if a file or directory exists
   */
  async exists(targetPath: string): Promise<boolean> {
    try {
      await fsPromises.access(targetPath)
      return true
    } catch {
      return false
    }
  }

  // Keep URL generation tolerant of protocol-relative base URLs like "//localhost:3000",
  // which are used by the current dev config and would otherwise make `new URL()` throw.
  private buildUrl(filePath: string): string {
    if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(filePath) || filePath.startsWith('//')) {
      return filePath
    }

    const normalizedPath = this.encodePath(`${filePath}`.replace(/^\/+/, ''))
    const normalizedBaseUrl = `${this.baseUrl}`.replace(/\/+$/, '')

    if (normalizedBaseUrl.startsWith('//')) {
      return `${normalizedBaseUrl}/${normalizedPath}`
    }

    const url = new URL(normalizedPath, `${normalizedBaseUrl}/`)
    return url.href
  }

  private encodePath(filePath: string): string {
    return filePath
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/')
  }
}
