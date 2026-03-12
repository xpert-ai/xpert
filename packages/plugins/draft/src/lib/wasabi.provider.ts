import { FileStorageProviderEnum } from '@metad/contracts'
import { FileStorageProvider } from '@xpert-ai/plugin-sdk'
import { Injectable } from '@nestjs/common'
import { S3CompatibleProvider } from './s3-compatible.provider'

@Injectable()
@FileStorageProvider(FileStorageProviderEnum.WASABI)
export class WasabiProvider extends S3CompatibleProvider {
  readonly name = FileStorageProviderEnum.WASABI
  protected readonly configKey = 'wasabi' as const
}
