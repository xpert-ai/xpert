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
   * Read file contents
   */
  async readFile(filePath: string, encoding: BufferEncoding = 'utf-8') {
    this.ensureAllowed('read')
    const fullPath = path.join(this.basePath, filePath)
    this.ensureInScope(fullPath)
    return await fsPromises.readFile(fullPath)
  }

  /**
   * Write file contents
   */
  async writeFile(filePath: string, content: string | Buffer): Promise<string> {
    this.ensureAllowed('write')
    const fullPath = path.join(this.basePath, filePath)
    this.ensureInScope(fullPath)
    await fsPromises.mkdir(path.dirname(fullPath), { recursive: true })
    await fsPromises.writeFile(fullPath, content)
    const url = new URL(filePath, this.baseUrl)
    return url.href
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
}
