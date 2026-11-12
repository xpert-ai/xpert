import { FileStorageOption, FileSystem, UploadedFile } from '@xpert-ai/contracts'

/** Object metadata supplied by the unified upload boundary. Existing providers may ignore it. */
export interface FileStoragePutOptions {
  /** MIME type to persist with the object when the provider supports content metadata. */
  contentType?: string
}

/**
 * Storage adapter for local files or object-store keys, registered with FileStorageProvider.
 * Callers must authorize access and supply scoped keys; this interface does not define resource permissions.
 */
export interface IFileStorageProvider {
  /** Stable provider identifier used for selection and persisted storage metadata, such as LOCAL or MINIO. */
  readonly name: string

  /** Effective provider configuration; may contain credentials and must remain server-side. */
  readonly config?: FileSystem & Record<string, any>

  /** Builds a public or temporary signed URL for a stored key. Signed URLs must be regenerated after expiry. */
  url(path: string): string

  /** Resolves a relative key against the provider root without reading or writing the file. */
  path(path: string): string

  /** Creates a Multer storage engine using the destination, filename and prefix options. */
  handler(options: FileStorageOption): any

  /** Reads the complete contents of a stored key into memory. */
  getFile(file: string): Promise<Buffer>

  /**
   * Writes content and returns normalized upload metadata. Use a Buffer for portable provider behavior.
   * @param fileContent Content accepted by the provider; string and URL handling is provider-specific.
   * @param path Destination key in the provider's storage namespace.
   * @param options Optional object metadata; providers that do not support it may ignore it.
   */
  putFile(fileContent: string | Buffer | URL, path?: string, options?: FileStoragePutOptions): Promise<UploadedFile>

  /** Deletes the stored bytes for a key; callers remain responsible for associated application records. */
  deleteFile(path: string): Promise<void>

  /** Normalizes provider-specific upload results into UploadedFile metadata; implementations may mutate the input. */
  mapUploadedFile?(file: any): UploadedFile
}
