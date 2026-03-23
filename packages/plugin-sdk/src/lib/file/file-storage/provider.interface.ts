import { FileStorageOption, FileSystem, UploadedFile } from '@metad/contracts'

export interface IFileStorageProvider {
  readonly name: string
  readonly config?: FileSystem & Record<string, any>

  url(path: string): string
  path(path: string): string
  handler(options: FileStorageOption): any
  getFile(file: string): Promise<Buffer>
  putFile(fileContent: string | Buffer | URL, path?: string): Promise<UploadedFile>
  deleteFile(path: string): Promise<void>
  mapUploadedFile?(file: any): UploadedFile
}
