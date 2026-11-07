import { FileStorageOption, UploadedFile } from '@xpert-ai/contracts'
import {
  FileStoragePutOptions,
  IFileStorageProvider,
  IPluginConfigResolver,
  PLUGIN_CONFIG_RESOLVER_TOKEN
} from '@xpert-ai/plugin-sdk'
import { Inject, Injectable, Optional } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'
import AWS from 'aws-sdk'
import multerS3 from 'multer-s3'
import { StorageEngine } from 'multer'
import { basename } from 'path'
import {
  DRAFT_FILE_STORAGE_PLUGIN_NAME,
  DraftFileStoragePluginConfig,
  S3CompatibleProviderConfig
} from './file-storage.types'
import { draftFileStoragePluginConfig } from './file-storage.config'
import { buildTenantScopedObjectKey, normalizeKey } from './storage-provider.utils'

type TS3CompatibleRuntimeConfig = Required<
  Pick<S3CompatibleProviderConfig, 'rootPath' | 'region' | 'forcePathStyle' | 'signedUrlExpires'>
> &
  Omit<S3CompatibleProviderConfig, 'rootPath' | 'region' | 'forcePathStyle' | 'signedUrlExpires'>

type TS3CompatibleSectionKey = 'minio' | 'rustfs' | 's3' | 'wasabi'

@Injectable()
// Private URLs must be signed with the browser-facing host; rewriting a signed host invalidates SigV4.
export abstract class S3CompatibleProvider implements IFileStorageProvider {
  abstract readonly name: string
  protected abstract readonly configKey: TS3CompatibleSectionKey
  protected defaultForcePathStyle = false

  constructor(
    @Optional()
    @Inject(draftFileStoragePluginConfig.KEY)
    private readonly envConfig: ConfigType<typeof draftFileStoragePluginConfig> | undefined,
    @Optional()
    @Inject(PLUGIN_CONFIG_RESOLVER_TOKEN)
    private readonly pluginConfigResolver?: IPluginConfigResolver
  ) {}

  get config(): TS3CompatibleRuntimeConfig {
    return this.mergeConfig()
  }

  url(filePath: string): string {
    const config = this.getValidatedConfig()
    if (config.publicUrl) {
      return this.buildProviderPublicUrl(config, filePath)
    }

    return this.getS3Instance({ ...config, endpoint: config.signedUrlEndpoint || config.endpoint }).getSignedUrl(
      'getObject',
      {
        Bucket: config.bucket,
        Key: filePath,
        Expires: config.signedUrlExpires
      }
    )
  }

  path(filePath: string): string {
    const config = this.mergeConfig()
    return filePath ? normalizeKey(config.rootPath, filePath) : null
  }

  handler({ dest, filename, prefix }: FileStorageOption): StorageEngine {
    const config = this.getValidatedConfig()
    return multerS3({
      s3: this.getS3Instance(config),
      bucket: config.bucket,
      contentType: multerS3.AUTO_CONTENT_TYPE,
      metadata: (_req, file, cb) => {
        cb(null, { fieldName: file.fieldname })
      },
      key: (_req, file, callback) => {
        const key = buildTenantScopedObjectKey(config.rootPath, file, dest, filename, prefix)
        callback(null, key)
      }
    })
  }

  async getFile(key: string): Promise<Buffer> {
    const config = this.getValidatedConfig()
    const data = await this.getS3Instance(config)
      .getObject({
        Bucket: config.bucket,
        Key: key
      })
      .promise()

    return data.Body as Buffer
  }

  async putFile(fileContent: string | Buffer | URL, key = '', options?: FileStoragePutOptions): Promise<UploadedFile> {
    const config = this.getValidatedConfig()
    if (fileContent instanceof URL) throw new TypeError('S3 putFile requires bytes, not a URL')
    const fileName = basename(key)
    const s3 = this.getS3Instance(config)

    await s3
      .putObject({
        Bucket: config.bucket,
        Body: fileContent,
        ContentType: options?.contentType || 'application/octet-stream',
        Key: key,
        ContentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(fileName).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)}`
      })
      .promise()

    const size = Buffer.isBuffer(fileContent) ? fileContent.length : Buffer.byteLength(fileContent)

    return this.mapUploadedFile({
      originalname: fileName,
      size,
      filename: fileName,
      path: key,
      key
    })
  }

  async deleteFile(key: string): Promise<void> {
    const config = this.getValidatedConfig()
    await this.getS3Instance(config)
      .deleteObject({
        Bucket: config.bucket,
        Key: key
      })
      .promise()
  }

  mapUploadedFile(file: any): UploadedFile {
    file.filename = file.originalname
    file.url = file.url || this.url(file.key)
    return file
  }

  protected mergeConfig(): TS3CompatibleRuntimeConfig {
    const pluginSection = this.resolvePluginSection()
    const envSection = (this.envConfig?.[this.configKey] ?? {}) as S3CompatibleProviderConfig

    return {
      rootPath: pluginSection.rootPath ?? envSection.rootPath ?? '',
      accessKeyId: pluginSection.accessKeyId ?? envSection.accessKeyId,
      secretAccessKey: pluginSection.secretAccessKey ?? envSection.secretAccessKey,
      region: pluginSection.region ?? envSection.region ?? 'us-east-1',
      bucket: pluginSection.bucket ?? envSection.bucket,
      endpoint: pluginSection.endpoint ?? envSection.endpoint,
      publicUrl: pluginSection.publicUrl ?? envSection.publicUrl,
      signedUrlEndpoint: pluginSection.signedUrlEndpoint ?? envSection.signedUrlEndpoint,
      forcePathStyle: pluginSection.forcePathStyle ?? envSection.forcePathStyle ?? this.defaultForcePathStyle,
      signedUrlExpires: pluginSection.signedUrlExpires ?? envSection.signedUrlExpires ?? 3600
    }
  }

  protected getS3Instance(config: TS3CompatibleRuntimeConfig) {
    return new AWS.S3({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      region: config.region,
      endpoint: config.endpoint || undefined,
      s3ForcePathStyle: config.forcePathStyle !== false,
      signatureVersion: 'v4'
    })
  }

  private resolvePluginSection(): S3CompatibleProviderConfig {
    const pluginConfig =
      this.pluginConfigResolver?.resolve<DraftFileStoragePluginConfig & Record<string, any>>(
        DRAFT_FILE_STORAGE_PLUGIN_NAME,
        {
          defaults: {}
        }
      ) ?? {}

    if (this.configKey === 'minio' && this.looksLikeLegacyMinioConfig(pluginConfig)) {
      return pluginConfig as S3CompatibleProviderConfig
    }

    return (pluginConfig[this.configKey] ?? {}) as S3CompatibleProviderConfig
  }

  private looksLikeLegacyMinioConfig(config: Record<string, any>) {
    return !!config && !config['minio'] && ('bucket' in config || 'endpoint' in config || 'accessKeyId' in config)
  }

  private getValidatedConfig(): TS3CompatibleRuntimeConfig {
    const config = this.mergeConfig()
    if (!config.bucket) {
      throw new Error(`${this.name} bucket is not configured`)
    }

    if (!Number.isInteger(config.signedUrlExpires) || config.signedUrlExpires < 1 || config.signedUrlExpires > 604800) {
      throw new Error(`${this.name} signed URL expiry must be between 1 and 604800 seconds`)
    }
    for (const endpoint of [config.endpoint, config.signedUrlEndpoint, config.publicUrl]) {
      if (!endpoint) continue
      let url: URL
      try {
        url = new URL(endpoint)
      } catch {
        throw new Error(`${this.name} endpoint must be an HTTP(S) URL`)
      }
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
        throw new Error(`${this.name} endpoint must be an HTTP(S) URL without credentials, query or fragment`)
      }
    }
    return config
  }

  private buildProviderPublicUrl(config: TS3CompatibleRuntimeConfig, key: string) {
    const base = `${config.publicUrl || ''}`.replace(/\/+$/, '')
    const bucket = `${config.bucket || ''}`.replace(/^\/+|\/+$/g, '')
    const normalizedKey = `${key || ''}`.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/')

    if (!base) {
      return normalizedKey
    }

    if (config.forcePathStyle === false) {
      const url = new URL(base)
      url.hostname = bucket ? `${bucket}.${url.hostname}` : url.hostname
      const basePath = url.pathname.replace(/\/+$/, '')
      url.pathname = [basePath, normalizedKey]
        .filter(Boolean)
        .join('/')
        .replace(/^([^/])/, '/$1')
      return url.toString()
    }

    return [base, bucket, normalizedKey].filter(Boolean).join('/')
  }
}
