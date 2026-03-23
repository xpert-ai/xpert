import { FileStorageOption, UploadedFile } from '@metad/contracts'
import {
  FileStorageProvider,
  IFileStorageProvider,
  IPluginConfigResolver,
  PLUGIN_CONFIG_RESOLVER_TOKEN
} from '@xpert-ai/plugin-sdk'
import { Inject, Injectable, Optional } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'
import OSS from 'ali-oss'
import { StorageEngine } from 'multer'
import { basename } from 'path'
import { DRAFT_FILE_STORAGE_PLUGIN_NAME, DraftFileStoragePluginConfig, OssProviderConfig } from './file-storage.types'
import { draftFileStoragePluginConfig } from './file-storage.config'
import { buildPublicUrl, buildTenantScopedObjectKey, normalizeKey } from './storage-provider.utils'
import { OSSStorageEngine } from './oss.storage-engine'

type TOssRuntimeConfig = Required<Pick<OssProviderConfig, 'rootPath'>> & Omit<OssProviderConfig, 'rootPath'>

@Injectable()
@FileStorageProvider('OSS')
export class OSSProvider implements IFileStorageProvider {
  readonly name = 'OSS'

  constructor(
    @Optional()
    @Inject(draftFileStoragePluginConfig.KEY)
    private readonly envConfig: ConfigType<typeof draftFileStoragePluginConfig> | undefined,
    @Optional()
    @Inject(PLUGIN_CONFIG_RESOLVER_TOKEN)
    private readonly pluginConfigResolver?: IPluginConfigResolver
  ) {}

  get config(): TOssRuntimeConfig {
    return this.mergeConfig()
  }

  url(filePath: string): string {
    const config = this.getValidatedConfig()
    if (config.publicUrl) {
      return buildPublicUrl(config.publicUrl, filePath)
    }

    return this.getOssInstance(config).signatureUrl(filePath)
  }

  path(filePath: string): string {
    const config = this.mergeConfig()
    return filePath ? normalizeKey(config.rootPath, filePath) : null
  }

  handler({ dest, filename, prefix }: FileStorageOption): StorageEngine {
    const config = this.getValidatedConfig()

    return new OSSStorageEngine(this.getOssInstance(config), (_req, file) => {
      return buildTenantScopedObjectKey(config.rootPath, file, dest, filename, prefix)
    })
  }

  async getFile(key: string): Promise<Buffer> {
    const config = this.getValidatedConfig()
    const data = await this.getOssInstance(config).get(key)
    return data.content as Buffer
  }

  async putFile(fileContent: string | Buffer | URL, key = ''): Promise<UploadedFile> {
    const config = this.getValidatedConfig()
    const fileName = basename(key)
    const oss = this.getOssInstance(config)
    const object = await oss.put(key, fileContent as any)

    return this.mapUploadedFile({
      originalname: fileName,
      size: object?.res?.size,
      filename: fileName,
      path: key,
      key
    })
  }

  async deleteFile(key: string): Promise<void> {
    const config = this.getValidatedConfig()
    await this.getOssInstance(config).delete(key)
  }

  mapUploadedFile(file: any): UploadedFile {
    file.filename = file.originalname
    file.url = file.url || this.url(file.key)
    return file
  }

  private mergeConfig(): TOssRuntimeConfig {
    const pluginConfig =
      this.pluginConfigResolver?.resolve<DraftFileStoragePluginConfig>(DRAFT_FILE_STORAGE_PLUGIN_NAME, {
        defaults: {}
      }) ?? {}
    const pluginSection = pluginConfig.oss ?? {}
    const envSection = this.envConfig?.oss ?? {}

    return {
      rootPath: pluginSection.rootPath ?? envSection.rootPath ?? '',
      accessKeyId: pluginSection.accessKeyId ?? envSection.accessKeyId,
      accessKeySecret: pluginSection.accessKeySecret ?? envSection.accessKeySecret,
      region: pluginSection.region ?? envSection.region,
      bucket: pluginSection.bucket ?? envSection.bucket,
      endpoint: pluginSection.endpoint ?? envSection.endpoint,
      publicUrl: pluginSection.publicUrl ?? envSection.publicUrl
    }
  }

  private getValidatedConfig(): TOssRuntimeConfig {
    const config = this.mergeConfig()
    if (!config.bucket || !config.region || !config.accessKeyId || !config.accessKeySecret) {
      throw new Error('OSS configuration is incomplete')
    }

    return config
  }

  private getOssInstance(config: TOssRuntimeConfig) {
    return new OSS({
      region: config.region,
      accessKeyId: config.accessKeyId,
      accessKeySecret: config.accessKeySecret,
      bucket: config.bucket,
      endpoint: config.endpoint || undefined
    })
  }
}
