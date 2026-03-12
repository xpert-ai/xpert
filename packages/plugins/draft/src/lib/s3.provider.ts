import { FileStorageProviderEnum } from '@metad/contracts'
import { FileStorageProvider } from '@xpert-ai/plugin-sdk'
import { Injectable } from '@nestjs/common'
import { S3CompatibleProvider } from './s3-compatible.provider'

@Injectable()
@FileStorageProvider(FileStorageProviderEnum.S3)
export class S3Provider extends S3CompatibleProvider {
  readonly name = FileStorageProviderEnum.S3
  protected readonly configKey = 's3' as const
}
